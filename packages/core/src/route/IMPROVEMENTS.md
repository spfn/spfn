# Route 모듈 개선 제안

> 분석 일자: 2025-10-11
> 분석 범위: `packages/core/src/route/` 전체 모듈
> 최종 업데이트: 2025-10-11

## 📋 목차

1. [✅ 완료된 개선사항](#-완료된-개선사항)
2. [중요도 중간 (Medium Priority)](#중요도-중간-medium-priority)
3. [중요도 낮음 (Low Priority)](#중요도-낮음-low-priority)

---

## ✅ 완료된 개선사항

### ~~1. Route Loading Error Handling~~ ✅

**상태**: 완료 (2025-10-11)

**구현 내용**:
- `loadRoute()` 메서드가 이제 `Promise<boolean>` 반환
- Try-catch로 모든 import 에러 처리
- 실패한 라우트는 skip하고 계속 진행
- 에러 로그 출력 및 debug 모드에서 stack trace 표시
- `load()` 메서드에서 성공/실패 카운트 추적

**결과**:
- 한 파일의 에러가 전체 서버를 중단시키지 않음
- 프로덕션 환경에서 안정성 향상
- 개발 중 에러 디버깅 용이

---

### ~~2. Route Priority Sorting~~ ✅

**상태**: 완료 (2025-10-11)

**구현 내용**:
- 파일 스캔 후 priority 계산하여 정렬
- Static (1) → Dynamic (2) → Catch-all (3) 순서로 등록
- Debug 모드에서 등록 순서 로그 출력

**결과**:
- 라우트 매칭이 예측 가능하고 정확함
- Catch-all 라우트가 다른 라우트 차단 불가
- 올바른 라우팅 동작 보장

---


## 🟡 중요도 중간 (Medium Priority)

### 3. Route Conflict Detection

**파일**: `auto-loader.ts` (새 기능 추가)

**현재 상태**: 라우트 충돌 감지 없음

**문제점**:
- 동일한 HTTP method + path 중복 등록 감지 안됨
- `/users/:id`와 `/users/:userId` 같은 충돌 감지 안됨
- 나중에 등록된 라우트가 이전 라우트를 덮어씀
- 의도하지 않은 동작 발생

**예시**:
```typescript
// routes/users/[id].ts
app.bind({ method: 'GET', path: '/:id', ... }, handler1);

// routes/users/[userId].ts
app.bind({ method: 'GET', path: '/:userId', ... }, handler2);

// 결과: handler2가 handler1을 덮어씀 (감지 안됨!)
```

**개선안**:
```typescript
export class AutoRouteLoader {
    private routes: RouteInfo[] = [];
    private registeredRoutes = new Map<string, string>(); // key: method:path, value: file

    // ... existing code

    private async loadRoute(app: Hono, absolutePath: string): Promise<boolean> {
        // ... existing import code

        try {
            // ... existing validation

            const urlPath = this.fileToPath(relativePath);

            // Check for conflicts
            const routeKey = `GET:${urlPath}`; // Simplification (should check actual methods)
            const existingFile = this.registeredRoutes.get(routeKey);

            if (existingFile) {
                console.warn(`⚠️  Route conflict detected:`);
                console.warn(`   ${routeKey}`);
                console.warn(`   Already registered by: ${existingFile}`);
                console.warn(`   Attempted by: ${relativePath}`);
                console.warn(`   → Skipping duplicate registration`);
                return false;
            }

            // Register route
            app.route(urlPath, module.default);

            // Track registration
            this.registeredRoutes.set(routeKey, relativePath);

            // ... rest of code

            return true;
        } catch (error) {
            // ... error handling
        }
    }
}
```

**개선 내용 (더 정확한 감지)**:
```typescript
// Extract HTTP methods from Hono instance
private extractMethods(honoInstance: Hono): string[] {
    // Hono의 route 정보를 읽어서 실제 등록된 methods 확인
    // 구현 복잡도: Medium
    // 또는 contract.meta에서 읽거나, 단순히 모든 method 체크
    return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
}

// Normalize path for comparison
private normalizePath(path: string): string {
    // /users/:id → /users/:param
    // /users/:userId → /users/:param
    // 동일한 패턴으로 정규화
    return path.replace(/:\w+/g, ':param');
}
```

**우선순위**: 🟡 Medium - 버그 예방

---

## 🟢 중요도 낮음 (Low Priority)

### 4. Code Duplication in create-app.ts

**파일**: `create-app.ts:103-148`

**현재 상태**:
```typescript
if (middlewares.length > 0) {
    switch (method) {
        case 'get':
            hono.get(path, ...middlewares, boundHandler);
            break;
        case 'post':
            hono.post(path, ...middlewares, boundHandler);
            break;
        // ... more cases
    }
} else {
    switch (method) {
        case 'get':
            hono.get(path, boundHandler);
            break;
        case 'post':
            hono.post(path, boundHandler);
            break;
        // ... more cases (duplicate!)
    }
}
```

**문제점**:
- 중복된 switch 문 (45줄 → 25줄로 줄일 수 있음)
- 유지보수 어려움 (새 메소드 추가 시 두 곳 수정)

**개선안**:
```typescript
app.bind = function <TContract extends RouteContract>(
    contract: TContract,
    ...args: [RouteHandler] | [MiddlewareHandler[], RouteHandler]
)
{
    const method = contract.method.toLowerCase();
    const path = contract.path;

    // Extract middlewares and handler
    const [middlewares, handler] = args.length === 1
        ? [[], args[0]]
        : [args[0], args[1]];

    // Create bound handler
    const boundHandler = bind(contract, handler);

    // Build handler array
    const handlers = middlewares.length > 0
        ? [...middlewares, boundHandler]
        : [boundHandler];

    // Register based on HTTP method
    switch (method)
    {
        case 'get':
            hono.get(path, ...handlers);
            break;
        case 'post':
            hono.post(path, ...handlers);
            break;
        case 'put':
            hono.put(path, ...handlers);
            break;
        case 'patch':
            hono.patch(path, ...handlers);
            break;
        case 'delete':
            hono.delete(path, ...handlers);
            break;
        case 'head':
            hono.head(path, ...handlers);
            break;
        case 'options':
            hono.options(path, ...handlers);
            break;
        default:
            throw new Error(`Unsupported HTTP method: ${contract.method}`);
    }
};
```

**우선순위**: 🟢 Low - 코드 품질 개선

---

### 5. Detailed Import Error Messages

**파일**: `auto-loader.ts:170-178`

**현재 상태**:
```typescript
catch (error) {
    const err = error as Error;
    console.error(`❌ ${relativePath}: ${err.message}`);
    return false;
}
```

**문제점**:
- Import 실패 원인 구분 안됨 (syntax error vs missing dependency)
- Stack trace 없음
- 복구 방법 제시 없음

**개선안**:
```typescript
catch (error) {
    const err = error as Error;

    // Categorize error type
    if (err.message.includes('Cannot find module')) {
        console.error(`❌ ${relativePath}: Missing dependency`);
        console.error(`   ${err.message}`);
        console.error(`   → Run: npm install`);
    }
    else if (err.message.includes('SyntaxError') || err.stack?.includes('SyntaxError')) {
        console.error(`❌ ${relativePath}: Syntax error`);
        console.error(`   ${err.message}`);
        if (this.debug && err.stack) {
            console.error(`   Stack trace:`);
            console.error(err.stack.split('\n').slice(0, 5).join('\n'));
        }
    }
    else {
        console.error(`❌ ${relativePath}: ${err.message}`);
        if (this.debug && err.stack) {
            console.error(`   Stack: ${err.stack}`);
        }
    }

    return false;
}
```

**우선순위**: 🟢 Low - 개발 경험 개선

---

## 📊 요약 및 우선순위

### ✅ 완료 (🔴 Critical)

1. ~~**Route Loading Error Handling**~~ - 완료
2. ~~**Route Priority Sorting**~~ - 완료

### 다음 릴리스 (🟡 Important)

3. **Route Conflict Detection** - 버그 예방

### 장기 개선 (🟢 Nice to Have)

4. **Code Duplication Removal** - 코드 품질
5. **Detailed Error Messages** - 개발 경험

---

## 🎯 실행 계획

### Phase 1: 필수 기능 ✅ **완료**
- [x] Route loading error handling (partial failure support)
- [x] Route priority sorting (static → dynamic → catch-all)

### Phase 2: 안정성 (선택)
- [ ] Route conflict detection
- [ ] Comprehensive error messages

### Phase 3: 코드 품질 (선택)
- [ ] Code duplication removal in create-app.ts

---

**작성자**: Claude Code Assistant
**최종 업데이트**: 2025-10-11