---
title: "Testing"
description: "Learn how to test Superfunction applications with Vitest and Playwright"
order: 3
available: true
---

# Testing

Superfunction applications can be thoroughly tested using modern testing tools like Vitest for unit/integration tests and Playwright for E2E tests.

## Testing Setup

Install testing dependencies:

```bash
# Install Vitest for unit and integration tests
pnpm add -D vitest @vitest/ui

# Install testing utilities
pnpm add -D @testing-library/react @testing-library/jest-dom happy-dom

# Install Playwright for E2E tests
pnpm add -D @playwright/test
```

### Vitest Configuration

Create `vitest.config.ts` in your project root:

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'happy-dom',
        setupFiles: ['./src/test/setup.ts'],
        include: ['**/*.{test,spec}.{ts,tsx}'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'src/test/',
                '**/*.d.ts',
                '**/*.config.*',
                '**/dist/',
            ],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
```

### Test Setup File

Create `src/test/setup.ts`:

```typescript
import '@testing-library/jest-dom';
import { beforeAll, afterAll, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup after each test
afterEach(() =>
{
    cleanup();
});

// Setup database connection for integration tests
beforeAll(async () =>
{
    // Initialize test database
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
});

afterAll(async () =>
{
    // Cleanup database connections
});
```

### Update package.json

```json
{
    "scripts": {
        "test": "vitest",
        "test:ui": "vitest --ui",
        "test:coverage": "vitest --coverage",
        "test:e2e": "playwright test",
        "test:e2e:ui": "playwright test --ui"
    }
}
```

## Unit Testing

### Testing Helper Functions

Test utility functions in isolation:

```typescript
// src/lib/utils.test.ts
import { describe, it, expect } from 'vitest';
import { slugify, formatDate } from '@/lib/utils';

describe('slugify', () =>
{
    it('should convert string to slug', () =>
    {
        expect(slugify('Hello World')).toBe('hello-world');
        expect(slugify('TypeScript & Node.js')).toBe('typescript-nodejs');
    });

    it('should handle special characters', () =>
    {
        expect(slugify('Hello! @#$% World')).toBe('hello-world');
    });
});

describe('formatDate', () =>
{
    it('should format date correctly', () =>
    {
        const date = new Date('2024-01-15');
        expect(formatDate(date)).toBe('January 15, 2024');
    });
});
```

### Testing Input Schema Validation

Test TypeBox schema validation for route inputs:

```typescript
// src/server/routes/users.test.ts
import { describe, it, expect } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { Type } from '@sinclair/typebox';

// Define schemas matching your route inputs
const createUserSchema = Type.Object({
    email: Type.String({ format: 'email' }),
    name: Type.String({ minLength: 1 }),
    password: Type.String({ minLength: 8 })
});

describe('createUser input validation', () =>
{
    it('should validate correct user data', () =>
    {
        const validData = {
            email: 'user@example.com',
            name: 'John Doe',
            password: 'secure123',
        };

        const result = Value.Check(createUserSchema, validData);

        expect(result).toBe(true);
    });

    it('should reject invalid email', () =>
    {
        const invalidData = {
            email: 'not-an-email',
            name: 'John Doe',
            password: 'secure123',
        };

        const result = Value.Check(createUserSchema, invalidData);

        expect(result).toBe(false);
    });

    it('should reject short password', () =>
    {
        const invalidData = {
            email: 'user@example.com',
            name: 'John Doe',
            password: '123',
        };

        const result = Value.Check(createUserSchema, invalidData);

        expect(result).toBe(false);
    });
});
```

### Testing Database Helpers

Test database helper functions:

```typescript
// src/lib/db/helpers.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { findOne, create, updateOne } from '@spfn/core/db';
import { users } from '@/server/entities/users';
import { getDatabaseOrThrow } from '@spfn/core/db';

describe('Database Helpers', () =>
{
    beforeEach(async () =>
    {
        // Clean up test data
        const db = getDatabaseOrThrow();
        await db.delete(users);
    });

    describe('create', () =>
    {
        it('should create a new user', async () =>
        {
            const userData = {
                email: 'test@example.com',
                name: 'Test User',
            };

            const user = await create(users, userData);

            expect(user).toMatchObject(userData);
            expect(user.id).toBeDefined();
            expect(user.createdAt).toBeInstanceOf(Date);
        });
    });

    describe('findOne', () =>
    {
        it('should find user by id', async () =>
        {
            const created = await create(users, {
                email: 'test@example.com',
                name: 'Test User',
            });

            const found = await findOne(users, { id: created.id });

            expect(found).toMatchObject(created);
        });

        it('should return null when user not found', async () =>
        {
            const found = await findOne(users, { id: '99999' });
            expect(found).toBeNull();
        });
    });

    describe('updateOne', () =>
    {
        it('should update user', async () =>
        {
            const created = await create(users, {
                email: 'test@example.com',
                name: 'Test User',
            });

            const updated = await updateOne(users, { id: created.id }, {
                name: 'Updated Name',
            });

            expect(updated.name).toBe('Updated Name');
            expect(updated.email).toBe(created.email);
        });
    });
});
```

## Integration Testing

### Testing API Endpoints

Test Hono routes with full validation:

```typescript
// src/server/routes/users.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { registerRoutes } from '@spfn/core/route';
import { appRouter } from '@/server/router';
import { getDatabaseOrThrow } from '@spfn/core/db';
import { users } from '@/server/entities/users';

// Create test app
const app = new Hono();
registerRoutes(app, appRouter);

describe('Users API', () =>
{
    beforeEach(async () =>
    {
        const db = getDatabaseOrThrow();
        await db.delete(users);
    });

    describe('POST /users', () =>
    {
        it('should create a new user', async () =>
        {
            const res = await app.request('/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: 'test@example.com',
                    name: 'Test User',
                    password: 'secure123',
                }),
            });

            expect(res.status).toBe(201);
            const data = await res.json();
            expect(data).toMatchObject({
                email: 'test@example.com',
                name: 'Test User',
            });
            expect(data.id).toBeDefined();
        });

        it('should return 400 for invalid email', async () =>
        {
            const res = await app.request('/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: 'invalid-email',
                    name: 'Test User',
                    password: 'secure123',
                }),
            });

            expect(res.status).toBe(400);
        });

        it('should return 409 for duplicate email', async () =>
        {
            // Create first user
            await app.request('/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: 'test@example.com',
                    name: 'User 1',
                    password: 'secure123',
                }),
            });

            // Try to create duplicate
            const res = await app.request('/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: 'test@example.com',
                    name: 'User 2',
                    password: 'secure123',
                }),
            });

            expect(res.status).toBe(409);
        });
    });

    describe('GET /users/:id', () =>
    {
        it('should get user by id', async () =>
        {
            // Create user
            const createRes = await app.request('/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: 'test@example.com',
                    name: 'Test User',
                    password: 'secure123',
                }),
            });
            const created = await createRes.json();

            // Get user
            const res = await app.request(`/users/${created.id}`);
            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data).toMatchObject({
                id: created.id,
                email: 'test@example.com',
                name: 'Test User',
            });
        });

        it('should return 404 for non-existent user', async () =>
        {
            const res = await app.request('/users/99999');
            expect(res.status).toBe(404);
        });
    });
});
```

### Testing with Middleware

Test protected routes with authentication:

```typescript
// src/server/routes/protected.test.ts
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { registerRoutes } from '@spfn/core/route';
import { appRouter } from '@/server/router';
import { generateToken } from '@/lib/auth';

const app = new Hono();
registerRoutes(app, appRouter);

describe('Protected Routes', () =>
{
    const validToken = generateToken({ userId: '1', email: 'test@example.com' });

    describe('GET /profile', () =>
    {
        it('should return 401 without token', async () =>
        {
            const res = await app.request('/profile');
            expect(res.status).toBe(401);
        });

        it('should return 401 with invalid token', async () =>
        {
            const res = await app.request('/profile', {
                headers: {
                    Authorization: 'Bearer invalid-token',
                },
            });
            expect(res.status).toBe(401);
        });

        it('should return profile with valid token', async () =>
        {
            const res = await app.request('/profile', {
                headers: {
                    Authorization: `Bearer ${validToken}`,
                },
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.email).toBe('test@example.com');
        });
    });
});
```

## E2E Testing with Playwright

### Playwright Configuration

Create `playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    use: {
        baseURL: 'http://localhost:3790',
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        command: 'pnpm run spfn:start',
        url: 'http://localhost:3790',
        reuseExistingServer: !process.env.CI,
    },
});
```

### E2E Test Example

```typescript
// e2e/users.spec.ts
import { test, expect } from '@playwright/test';

test.describe('User Management', () =>
{
    test('should create a new user', async ({ page }) =>
    {
        await page.goto('/users/new');

        // Fill form
        await page.fill('input[name="email"]', 'test@example.com');
        await page.fill('input[name="name"]', 'Test User');
        await page.fill('input[name="password"]', 'secure123');

        // Submit
        await page.click('button[type="submit"]');

        // Verify success
        await expect(page).toHaveURL(/\/users\/\d+/);
        await expect(page.locator('h1')).toContainText('Test User');
    });

    test('should display validation errors', async ({ page }) =>
    {
        await page.goto('/users/new');

        // Submit without filling form
        await page.click('button[type="submit"]');

        // Verify errors
        await expect(page.locator('.error')).toContainText('Email is required');
    });

    test('should list all users', async ({ page, request }) =>
    {
        // Create test users via API
        await request.post('http://localhost:8790/users', {
            data: {
                email: 'user1@example.com',
                name: 'User 1',
                password: 'secure123',
            },
        });
        await request.post('http://localhost:8790/users', {
            data: {
                email: 'user2@example.com',
                name: 'User 2',
                password: 'secure123',
            },
        });

        // Visit users page
        await page.goto('/users');

        // Verify users are listed
        await expect(page.locator('text=User 1')).toBeVisible();
        await expect(page.locator('text=User 2')).toBeVisible();
    });
});
```

## Test Patterns

### Factory Pattern for Test Data

Create factories to generate test data:

```typescript
// src/test/factories/user.factory.ts
import { faker } from '@faker-js/faker';
import { create } from '@spfn/core/db';
import { users } from '@/server/entities/users';

export async function createUser(overrides = {})
{
    const userData = {
        email: faker.internet.email(),
        name: faker.person.fullName(),
        password: faker.internet.password(),
        ...overrides,
    };

    return create(users, userData);
}

export function buildUser(overrides = {})
{
    return {
        email: faker.internet.email(),
        name: faker.person.fullName(),
        password: faker.internet.password(),
        ...overrides,
    };
}

// Usage in tests
import { createUser, buildUser } from '@/test/factories/user.factory';

// Create in database
const user = await createUser({ email: 'specific@example.com' });

// Build without saving
const userData = buildUser({ name: 'Specific Name' });
```

### Database Seeding

```typescript
// src/test/seed.ts
import { getDatabaseOrThrow } from '@spfn/core/db';
import { users, teams } from '@/server/entities';
import { createUser } from '@/test/factories/user.factory';

export async function seedDatabase()
{
    // Create test users
    const user1 = await createUser({
        email: 'admin@example.com',
        name: 'Admin User',
    });

    const user2 = await createUser({
        email: 'user@example.com',
        name: 'Regular User',
    });

    // Create test teams
    const db = getDatabaseOrThrow();
    await db.insert(teams).values([
        { name: 'Engineering', ownerId: user1.id },
        { name: 'Marketing', ownerId: user2.id },
    ]);
}

export async function cleanDatabase()
{
    const db = getDatabaseOrThrow();
    await db.delete(teams);
    await db.delete(users);
}

// Usage in test setup
import { beforeEach } from 'vitest';
import { seedDatabase, cleanDatabase } from '@/test/seed';

beforeEach(async () =>
{
    await cleanDatabase();
    await seedDatabase();
});
```

### Mocking External Services

```typescript
// src/test/mocks/email.ts
import { vi } from 'vitest';

export const mockEmailService = {
    sendEmail: vi.fn().mockResolvedValue({ success: true }),
    sendPasswordReset: vi.fn().mockResolvedValue({ success: true }),
};

// Usage in tests
import { describe, it, expect, beforeEach } from 'vitest';
import { mockEmailService } from '@/test/mocks/email';

describe('Password Reset', () =>
{
    beforeEach(() =>
    {
        mockEmailService.sendPasswordReset.mockClear();
    });

    it('should send password reset email', async () =>
    {
        await resetPassword('user@example.com');

        expect(mockEmailService.sendPasswordReset).toHaveBeenCalledWith({
            to: 'user@example.com',
            token: expect.any(String),
        });
    });
});
```

## CI/CD Integration

GitHub Actions workflow for running tests:

```yaml
# .github/workflows/test.yml
name: Tests

on:
    push:
        branches: [main]
    pull_request:
        branches: [main]

jobs:
    test:
        runs-on: ubuntu-latest

        services:
            postgres:
                image: postgres:16-alpine
                env:
                    POSTGRES_USER: test
                    POSTGRES_PASSWORD: test
                    POSTGRES_DB: test_db
                options: >-
                    --health-cmd pg_isready
                    --health-interval 10s
                    --health-timeout 5s
                    --health-retries 5
                ports:
                    - 5432:5432

        steps:
            - uses: actions/checkout@v4

            - name: Setup Node.js
              uses: actions/setup-node@v4
              with:
                  node-version: '20'

            - name: Install pnpm
              uses: pnpm/action-setup@v2
              with:
                  version: 8

            - name: Install dependencies
              run: pnpm install

            - name: Run unit tests
              env:
                  DATABASE_URL: postgresql://test:test@localhost:5432/test_db
              run: pnpm test

            - name: Run E2E tests
              env:
                  DATABASE_URL: postgresql://test:test@localhost:5432/test_db
              run: pnpm test:e2e

            - name: Upload coverage
              uses: codecov/codecov-action@v3
              with:
                  files: ./coverage/coverage-final.json

            - name: Upload Playwright report
              if: always()
              uses: actions/upload-artifact@v3
              with:
                  name: playwright-report
                  path: playwright-report/
```

## Best Practices

### 1. Test Organization
- Keep tests close to source code (co-location)
- Use descriptive test names that explain behavior
- Follow Arrange-Act-Assert pattern
- One assertion per test (when possible)

### 2. Database Testing
- Use a separate test database
- Clean up data between tests
- Use transactions for test isolation
- Seed data consistently

### 3. API Testing
- Test both success and error cases
- Validate response structure and types
- Test input validation
- Test middleware behavior

### 4. Performance
- Run tests in parallel when possible
- Mock external services to reduce latency
- Use factories instead of fixtures for flexibility
- Keep E2E tests minimal and focused

> **Note:** Test Coverage Goals
> - **Unit tests**: Aim for 80%+ coverage on business logic
> - **Integration tests**: Cover all API endpoints
> - **E2E tests**: Cover critical user journeys
> - **Input validation tests**: Validate all schema definitions

> **Next: Deployment**
>
> Now that you know how to test your Superfunction application, learn how to deploy it to production.
>
> [Deployment →](/docs/guides/deployment)