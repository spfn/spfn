# Create Entity

새로운 Drizzle ORM entity를 생성합니다.

## 워크플로우

### 1. 사용자에게 정보 수집

다음 정보를 **반드시** 사용자에게 물어보세요:

1. **패키지 선택**: 어떤 패키지에 생성할지? (예: `auth`, `user`)
2. **엔티티 이름**: 파일명 (kebab-case, 예: `user-sessions`, `refresh-tokens`)
3. **테이블 이름**: DB 테이블명 (snake_case, 예: `user_sessions`, `refresh_tokens`)
4. **컬럼 정보**: 각 컬럼의 이름, 타입, 제약조건
   - 예: `token: text, notNull, unique`
   - 예: `expiresAt: timestamp, notNull`
5. **외래키**: 다른 테이블과의 관계 (있다면)
   - 예: `userId -> users.id (required)`
   - 예: `categoryId -> categories.id (optional)`

### 2. 기존 패턴 확인

사용자에게 정보를 받은 **후**, 기존 entity 파일들을 Read 도구로 확인:
- `packages/{package}/src/server/entities/` 폴더의 기존 파일들
- 특히 `user-keys.ts`, `otp-logs.ts` 파일을 참고

### 3. 엔티티 파일 생성

다음 패턴을 **엄격히** 준수:

```typescript
/**
 * {Entity Name} Entity
 *
 * {Description}
 * Stored in {schema_name} schema
 */

import { text, timestamp, ... } from 'drizzle-orm/pg-core';
import { id, timestamps, foreignKey } from '@spfn/core/db';
import { schemaName } from './existing-file.js';  // 기존 스키마 재사용

/**
 * {Table description}
 */
export const tableName = schemaName.table('table_name', {
  id: id(),

  // 컬럼들 (사용자 입력 기반)
  // 예: token: text('token').notNull().unique(),
  // 예: expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),

  ...timestamps(),
});

export type EntityName = typeof tableName.$inferSelect;
export type NewEntityName = typeof tableName.$inferInsert;
```

**중요 규칙:**
- `spfnAuth` 같은 스키마는 **재사용** (import)
- `id()` 필수
- `...timestamps()` 필수 (마지막)
- JSDoc 주석 추가
- 타입 export 필수

### 4. index.ts 업데이트

`entities/index.ts`에 export 추가:

```typescript
export { tableName } from './file-name.js';
export type { EntityName, NewEntityName } from './file-name.js';
```

### 5. 확인사항

- [ ] 파일명이 kebab-case인가? (예: `user-sessions.ts`)
- [ ] 테이블명이 snake_case인가? (예: `user_sessions`)
- [ ] 스키마를 기존 파일에서 import했는가?
- [ ] `id()`, `timestamps()` 사용했는가?
- [ ] 외래키에 `foreignKey()` 또는 `optionalForeignKey()` 사용했는가?
- [ ] 타입 export했는가?
- [ ] `index.ts`에 추가했는가?

## 중요

**절대로 추측하지 말고, 반드시 사용자에게 먼저 물어보고 기존 파일을 확인하세요.**