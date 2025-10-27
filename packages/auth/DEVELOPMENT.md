# @spfn/auth Development Guide

## ⚠️ MUST READ BEFORE CONTINUING

### Critical Files to Check First

1. **`/workspaces/.claude/rules.md`** - Code style rules (Allman-style braces, 4-space indentation)
2. **`/workspaces/.claude/commands/spfn-architecture.md`** - SPFN contract-based routing architecture
3. **`packages/auth/DEVELOPMENT.md`** (this file) - Current development status and blockers

---

## Current Status

### Completed ✅

1. **Entity Definitions** (all following Allman-style)
   - `src/entities/users.ts` - Main user table with email/phone support
   - `src/entities/user-social-accounts.ts` - OAuth provider connections
   - `src/entities/verification-codes.ts` - Email/phone verification codes
   - Schema: `spfn_auth` (auto-generated from `@spfn/auth` by `createFunctionSchema`)

2. **API Response Protocol**
   - `src/types/api.ts` - TypeScript types and helper functions
   - `src/types/schemas.ts` - TypeBox schemas for contracts
   - Standard format: `{ success: true, data: {...} }` or `{ success: false, error: {...} }`

3. **Routes Implementation**
   - `src/routes/auth/contract.ts` - API contracts using TypeBox
   - `src/routes/auth/index.ts` - Route handlers with `app.bind()`
   - **Implemented**: POST `/auth/exists` - Check account existence

4. **Test Environment Setup**
   - `docker-compose.test.yml` - PostgreSQL on port **5435**
   - `vitest.config.ts` - Integration test configuration
   - `src/__tests__/helpers/db.ts` - Test database setup utilities
   - Docker scripts: `pnpm docker:test:up/down/logs`

### In Progress 🚧

**Testing the `/auth/exists` endpoint**

**Current Test Results:**
- ✅ 3/7 tests passing (all validation tests)
- ❌ 4/7 tests failing (email/phone lookup tests)

**Blocker:**
```
Error: Database not initialized. Call initDatabase() first.
```

### Known Issues ❌

#### 1. `@spfn/core/db` Initialization in Tests

**Problem:**
- `initDatabase()` is called in `setupTestDb()` helper
- But `@spfn/core/db`'s `findOne()` still throws "Database not initialized"
- Likely a singleton/connection pooling issue

**Location:**
- `src/__tests__/helpers/db.ts:32-36` - Calls `initDatabase()`
- `src/routes/auth/index.ts:64` - Uses `findOne()` which fails

**Possible Solutions:**
1. Investigate `@spfn/core/db` singleton pattern
2. Add ability to inject DB instance into routes
3. Mock `@spfn/core/db` for unit tests instead of integration tests

#### 2. Error Handler in `createApp()`

**Problem:**
- `@spfn/core/route`'s `createApp()` doesn't have built-in error handler
- ValidationErrors are thrown as uncaught exceptions (500 errors)

**Temporary Fix:**
- Added `app.onError()` middleware in `src/routes/auth/index.ts:14-47`
- This catches ValidationError and returns proper 400 response

**Long-term Solution:**
- Add error handler to `@spfn/core/route/create-app.ts`
- All SPFN apps should have consistent error handling

#### 3. TypeBox Email Format

**Problem:**
- TypeBox doesn't recognize `format: 'email'` by default
- Throws "Unknown format 'email'" error

**Solution Applied:**
- Changed from `Type.String({ format: 'email' })`
- To `Type.String({ pattern: EMAIL_PATTERN })` with regex
- See `src/routes/auth/contract.ts:9`

---

## Test Execution

### Start Test Database

```bash
cd packages/auth
pnpm docker:test:up

# Check if running
docker ps | grep spfn-auth-test-postgres
```

### Run Tests

```bash
# All route tests
pnpm test:routes

# Run once (no watch)
pnpm test:routes --run
```

### Stop Test Database

```bash
pnpm docker:test:down
```

### Current Test Output

```bash
 Test Files  1 failed (1)
      Tests  4 failed | 3 passed (7)

✅ Validation tests (3/3):
  - should return error when neither email nor phone is provided
  - should validate email format
  - should validate phone format (E.164)

❌ Lookup tests (0/4):
  - Email lookup > should return exists: true when user exists with email
  - Email lookup > should return exists: false when user does not exist with email
  - Phone lookup > should return exists: true when user exists with phone
  - Phone lookup > should return exists: false when user does not exist with phone

Error: Database not initialized. Call initDatabase() first.
```

---

## Architecture

### Contract-Based Routing

From `.claude/commands/spfn-architecture.md`:

```typescript
// 1. Define contract (TypeBox schema)
export const myContract = {
    method: 'POST' as const,
    path: '/my-route',
    body: Type.Object({ ... }),
    response: Type.Object({ ... }),
};

// 2. Bind handler
const app = createApp();
app.bind(myContract, async (c) => {
    const body = await c.data(); // Auto-validated
    return c.json({ ... });
});

export default app;
```

### Database Schema

- Schema name: `spfn_auth` (from `@spfn/auth` via `createFunctionSchema`)
- Tables:
  - `users` - email/phone, passwordHash, role, status, verification timestamps
  - `user_social_accounts` - OAuth connections (Google, GitHub, Kakao, Naver)
  - `verification_codes` - Time-based codes for email/phone verification

---

## Next Steps

### Immediate (Fix Tests)

1. **Investigate `@spfn/core/db` initialization**
   - Check singleton pattern in `packages/core/src/db/index.ts`
   - Understand connection pooling behavior
   - Determine if `initDatabase()` needs to be called differently in tests

2. **Alternative: Inject DB Instance**
   - Modify routes to accept optional DB instance
   - Pass test DB directly instead of relying on global singleton

3. **Alternative: Unit Tests with Mocks**
   - Mock `@spfn/core/db` functions
   - Test route logic without real database
   - Keep integration tests separate

### Short-term (Complete Phase 1)

1. Fix test environment and make all tests pass
2. Implement remaining auth routes:
   - POST `/auth/register` - User registration with email/phone
   - POST `/auth/verify-code` - Verify email/phone code
   - POST `/auth/login` - Email/phone + password login
   - POST `/auth/social/google` - Google OAuth login

3. Implement helper functions:
   - Password hashing (bcrypt)
   - JWT generation/validation (RS256)
   - Verification code generation

### Medium-term (Production Ready)

1. Add environment variables configuration
2. Implement middleware (Authenticate, Authorize)
3. Add rate limiting for verification codes
4. Add comprehensive error handling
5. Write integration tests for full auth flows

---

## Code Style Reminders

From `.claude/rules.md`:

- **Allman-style braces**: Opening brace on next line for functions, if/else, try/catch
- **4-space indentation**: Not 2 spaces
- **Object literals**: Keep braces on same line
- **Imports**: Use barrel exports (`from '../../entities'` not `from '../../entities/users.js'`)

---

## Dependencies

```json
{
  "dependencies": {
    "@spfn/core": "workspace:*",
    "bcrypt": "^5.1.1",
    "drizzle-orm": "^0.44.6",
    "jsonwebtoken": "^9.0.2",
    "postgres": "^3.4.0"
  },
  "devDependencies": {
    "vitest": "^3.2.4",
    "@types/bcrypt": "^5.0.2",
    "@types/jsonwebtoken": "^9.0.6"
  }
}
```

---

## Questions to Resolve

1. How should `@spfn/core/db` be initialized in test environments?
2. Should we add global error handler to `createApp()`?
3. Should TypeBox format validators be registered globally in `@spfn/core`?
4. How to handle test isolation with shared DB connection pool?

---

**Last Updated:** 2025-10-27
**Session:** Auth package implementation - exists route + test environment