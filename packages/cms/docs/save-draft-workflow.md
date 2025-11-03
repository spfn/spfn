# saveDraft 동작 설명

`saveDraft` 함수는 CMS에서 Draft 상태의 콘텐츠를 저장하는 Server Action입니다.

## 함수 위치

```
/src/views/admin/labels/home/actions.ts
```

## 전체 흐름

```
UI (사용자 입력)
  ↓
handleSaveDraft() (Client Component)
  ↓
saveDraft() (Server Action)
  ↓
CMS API (/_cms/values/:labelId)
  ↓
Database (cms_label_values 테이블)
  ↓
revalidatePath() (Next.js Cache 갱신)
```

---

## 1. UI 레이어 (Client Component)

### `handleSaveDraft()` in label-management.client.tsx

사용자가 "Save Draft" 버튼을 클릭하면 실행됩니다.

```typescript
const handleSaveDraft = async () =>
{
    if (!selectedLabel) return;

    setIsSaving(true);
    try
    {
        // 1. 라벨 타입에 따라 값 구조화
        let value: any;

        if (selectedLabel.type === 'text')
        {
            // 텍스트: 문자열 그대로
            value = editValue;
        }
        else if (selectedLabel.type === 'image')
        {
            // 이미지: JSON 파싱
            try
            {
                value = JSON.parse(editValue);
            }
            catch
            {
                // 파싱 실패 시 기본 구조
                value = {
                    type: 'image',
                    src: editValue,
                    alt: ''
                };
            }
        }
        else
        {
            // 기타 타입: JSON 파싱 시도
            try
            {
                value = JSON.parse(editValue);
            }
            catch
            {
                value = {
                    type: selectedLabel.type,
                    content: editValue
                };
            }
        }

        // 2. Server Action 호출
        const result = await saveDraft({
            labelId: selectedLabel.id,
            locale: activeLocale,       // 현재 선택된 로케일 (ko, en, ja)
            breakpoint: null,           // 현재는 breakpoint 미사용
            value,
        });

        // 3. 결과 처리
        if (result.success)
        {
            alert('Draft saved successfully!');
            window.location.reload(); // 페이지 새로고침으로 최신 데이터 반영
        }
        else
        {
            alert(`Failed to save: ${result.error}`);
        }
    }
    catch (error)
    {
        console.error('[handleSaveDraft] Error:', error);
        alert('Failed to save draft');
    }
    finally
    {
        setIsSaving(false);
    }
};
```

### 주요 동작:

1. **값 타입 변환**: 라벨 타입(text, image, video, file)에 따라 값 구조화
2. **Server Action 호출**: `saveDraft()` 호출하여 서버에 저장 요청
3. **결과 처리**: 성공 시 페이지 새로고침, 실패 시 에러 메시지 표시
4. **상태 관리**: `isSaving` 상태로 로딩 UI 표시

---

## 2. Server Action 레이어

### `saveDraft()` in actions.ts

Next.js Server Action으로, 서버에서 실행됩니다.

```typescript
export async function saveDraft(input: SaveDraftInput): Promise<{
    success: boolean;
    error?: string
}>
{
    try
    {
        const { labelId, locale, breakpoint, value } = input;

        // 1. 라벨 존재 확인
        const labelResponse = await cmsApi.getLabel({
            params: { id: String(labelId) }
        });

        if ('error' in labelResponse)
        {
            return { success: false, error: 'Label not found' };
        }

        // 2. Draft 저장 (version: null)
        const saveResponse = await cmsApi.saveValues({
            params: { labelId: String(labelId) },
            body: {
                version: null, // ⭐ Draft는 version=null
                values: [{
                    locale,
                    breakpoint: breakpoint === 'default' ? null : breakpoint,
                    value: value as any // JSONB로 저장
                }]
            }
        });

        if ('error' in saveResponse)
        {
            return { success: false, error: saveResponse.error };
        }

        // 3. Next.js 캐시 무효화
        revalidatePath('/admin/labels/home');

        return { success: true };
    }
    catch (error)
    {
        console.error('[saveDraft] Error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to save draft'
        };
    }
}
```

### 주요 동작:

1. **라벨 검증**: 라벨 ID가 유효한지 확인
2. **Draft 저장**: `version: null`로 저장 (Draft 상태)
3. **캐시 무효화**: `revalidatePath()`로 Next.js 캐시 갱신

---

## 3. CMS API 레이어

### POST `/_cms/values/:labelId`

CMS 패키지의 API 엔드포인트로, 실제 데이터베이스에 저장합니다.

**요청:**
```typescript
POST /_cms/values/123
{
  version: null,        // Draft는 항상 null
  values: [
    {
      locale: 'ko',
      breakpoint: null,
      value: "환영합니다"  // JSONB
    }
  ]
}
```

**동작:**
```typescript
// packages/cms/src/server/routes/values/[labelId]/index.ts
app.bind(saveValuesContract, [Transactional()], async (c) =>
{
    const { labelId: labelIdStr } = c.params;
    const labelId = parseInt(labelIdStr, 10);
    const body = await c.data();

    // 라벨 존재 확인
    const label = await cmsLabelsRepository.findById(labelId);
    if (!label) return c.json({ error: 'Label not found' }, 404);

    // 값 저장 (Upsert)
    const savedValues = await cmsLabelValuesRepository.upsertMany(
        body.values.map((v) => ({
            labelId,
            version: body.version,  // null (Draft)
            locale: v.locale,
            breakpoint: v.breakpoint ?? null,
            value: v.value,
        }))
    );

    return c.json({
        success: true,
        saved: savedValues.length,
        version: body.version,
    });
});
```

---

## 4. Repository 레이어

### `upsertMany()` in cms-label-values.repository.ts

실제 데이터베이스 저장 로직입니다.

```typescript
export async function upsertMany(
    values: Array<{
        labelId: number;
        version: number | null;
        locale: string;
        breakpoint: string | null;
        value: any;
    }>
): Promise<CmsLabelValue[]>
{
    const results: CmsLabelValue[] = [];

    for (const v of values)
    {
        // Upsert: (labelId, version, locale, breakpoint) 조합이 같으면 UPDATE, 없으면 INSERT
        const [result] = await db
            .insert(cmsLabelValues)
            .values({
                labelId: v.labelId,
                version: v.version,
                locale: v.locale,
                breakpoint: v.breakpoint,
                value: v.value,
                createdAt: new Date(),
            })
            .onConflictDoUpdate({
                target: [
                    cmsLabelValues.labelId,
                    cmsLabelValues.version,
                    cmsLabelValues.locale,
                    cmsLabelValues.breakpoint
                ],
                set: {
                    value: v.value,
                    // createdAt는 업데이트하지 않음 (원본 생성 시간 유지)
                }
            })
            .returning();

        results.push(result);
    }

    return results;
}
```

### Upsert 동작:

**INSERT (신규 저장)**:
```sql
INSERT INTO cms_label_values
  (label_id, version, locale, breakpoint, value, created_at)
VALUES
  (123, NULL, 'ko', NULL, '"환영합니다"', NOW())
```

**UPDATE (기존 값 수정)**:
```sql
-- 같은 (labelId, version, locale, breakpoint) 조합이 있으면
UPDATE cms_label_values
SET value = '"환영합니다 (수정됨)"'
WHERE label_id = 123
  AND version IS NULL
  AND locale = 'ko'
  AND breakpoint IS NULL
```

---

## 5. 데이터베이스 레이어

### cms_label_values 테이블

Draft가 저장되는 최종 장소입니다.

**테이블 구조:**
```sql
CREATE TABLE cms_label_values (
  id SERIAL PRIMARY KEY,
  label_id INTEGER NOT NULL REFERENCES cms_labels(id) ON DELETE CASCADE,
  version INTEGER,              -- NULL = Draft, 숫자 = Published
  locale VARCHAR(10) NOT NULL,  -- 'ko', 'en', 'ja'
  breakpoint VARCHAR(50),       -- NULL, 'mobile', 'tablet', 'desktop'
  value JSONB NOT NULL,         -- 실제 콘텐츠 값
  created_at TIMESTAMP NOT NULL,

  -- Unique constraint: 같은 (label_id, version, locale, breakpoint)는 하나만
  UNIQUE(label_id, version, locale, breakpoint)
);
```

**저장된 데이터 예시:**
```sql
id | label_id | version | locale | breakpoint | value                    | created_at
---|----------|---------|--------|------------|--------------------------|------------------
1  | 123      | NULL    | ko     | NULL       | "환영합니다"              | 2025-01-03 10:00
2  | 123      | NULL    | en     | NULL       | "Welcome"                | 2025-01-03 10:01
3  | 123      | 1       | ko     | NULL       | "환영합니다"              | 2025-01-03 11:00 (Published)
4  | 123      | 1       | en     | NULL       | "Welcome"                | 2025-01-03 11:01 (Published)
```

---

## 데이터 타입별 저장 형식

### 1. Text (문자열)

```typescript
// Input
value = "환영합니다"

// Database (JSONB)
value = "환영합니다"  // 문자열 그대로
```

### 2. Image

```typescript
// Input
value = {
  type: 'image',
  src: '/images/hero.jpg',
  alt: 'Hero image',
  width: 1920,
  height: 1080
}

// Database (JSONB)
value = {
  "type": "image",
  "src": "/images/hero.jpg",
  "alt": "Hero image",
  "width": 1920,
  "height": 1080
}
```

### 3. Video

```typescript
// Input
value = {
  type: 'video',
  src: '/videos/intro.mp4',
  poster: '/images/poster.jpg'
}

// Database (JSONB)
value = {
  "type": "video",
  "src": "/videos/intro.mp4",
  "poster": "/images/poster.jpg"
}
```

---

## Draft vs Published 구분

### Draft (version = NULL)
- 작업 중인 콘텐츠
- 여러 번 수정 가능
- 프론트엔드에 노출되지 않음
- `saveDraft()` 호출 시 저장

### Published (version = 1, 2, 3, ...)
- 발행된 콘텐츠
- 버전별로 히스토리 관리
- 프론트엔드에 노출됨
- `publishLabel()` 호출 시 생성

**상태 전환:**
```
Draft (v=null) --[Save Draft]--> Draft (v=null, 수정됨)
                    ↓
                [Publish]
                    ↓
            Published (v=1)
                    ↓
Draft (v=null, 새 수정) --[Save Draft]--> Draft (v=null, 계속 수정)
                    ↓
                [Publish]
                    ↓
            Published (v=2)
```

---

## revalidatePath() 동작

Next.js의 캐시 무효화 기능입니다.

```typescript
revalidatePath('/admin/labels/home');
```

**효과:**
1. `/admin/labels/home` 페이지의 서버 컴포넌트 캐시 무효화
2. 다음 페이지 방문 시 새로운 데이터로 렌더링
3. `getLabels()` 등의 서버 함수가 다시 실행됨

**없으면:**
- 저장 후에도 이전 데이터가 계속 표시됨
- 브라우저 새로고침을 해야 새 데이터 확인 가능

---

## 전체 데이터 흐름 예시

### 1. 새 Draft 저장

**사용자 입력:**
```
Label: "home.hero.title"
Locale: "ko"
Value: "환영합니다"
```

**Database (저장 전):**
```sql
-- 비어있음
```

**saveDraft() 실행:**
```typescript
saveDraft({
  labelId: 123,
  locale: 'ko',
  breakpoint: null,
  value: "환영합니다"
})
```

**Database (저장 후):**
```sql
INSERT INTO cms_label_values
  (label_id, version, locale, breakpoint, value)
VALUES
  (123, NULL, 'ko', NULL, '"환영합니다"')
```

### 2. 기존 Draft 수정

**사용자 입력:**
```
Value: "환영합니다!" (수정)
```

**Database (수정 전):**
```sql
id=1 | label_id=123 | version=NULL | locale=ko | value="환영합니다"
```

**saveDraft() 실행:**
```typescript
saveDraft({
  labelId: 123,
  locale: 'ko',
  breakpoint: null,
  value: "환영합니다!"
})
```

**Database (수정 후):**
```sql
-- Upsert: 같은 (123, NULL, 'ko', NULL) 조합이 있으므로 UPDATE
UPDATE cms_label_values
SET value = '"환영합니다!"'
WHERE id = 1

-- 결과
id=1 | label_id=123 | version=NULL | locale=ko | value="환영합니다!"
```

---

## 에러 처리

### 1. 라벨이 없는 경우

```typescript
// Input
saveDraft({ labelId: 999, ... })

// Response
{ success: false, error: 'Label not found' }
```

### 2. 네트워크 에러

```typescript
// Response
{ success: false, error: 'Failed to save draft' }

// Console
[saveDraft] Error: fetch failed
```

### 3. 데이터베이스 에러

```typescript
// Response
{ success: false, error: 'Database constraint violation' }
```

---

## 요약

1. **UI**: 사용자가 값 입력 후 "Save Draft" 클릭
2. **Client**: `handleSaveDraft()` → 값 타입 변환 → Server Action 호출
3. **Server Action**: `saveDraft()` → 라벨 검증 → CMS API 호출 → 캐시 무효화
4. **CMS API**: POST `/_cms/values/:labelId` → 트랜잭션 실행
5. **Repository**: `upsertMany()` → 데이터베이스 Upsert
6. **Database**: `cms_label_values` 테이블에 `version=NULL`로 저장
7. **Result**: 페이지 새로고침으로 새 데이터 표시

**핵심 특징:**
- Draft는 `version: null`로 구분
- Upsert 방식으로 여러 번 수정 가능
- JSONB로 유연한 데이터 구조 지원
- 트랜잭션으로 데이터 일관성 보장
- Next.js 캐시 무효화로 최신 데이터 반영