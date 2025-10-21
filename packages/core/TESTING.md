# Testing Guide

## Overview

SPFN Core uses a **modular testing strategy** with vitest to optimize for:
- **Speed**: Fast unit tests for quick feedback
- **Isolation**: Module-specific tests without dependencies
- **Resource efficiency**: Minimal memory usage

## Test Categories

### Unit Tests (Fast, No Infrastructure)

Pure logic tests that don't require external services:

```bash
pnpm test:unit         # All unit tests (2-3s)
pnpm test:logger       # Logger module only
pnpm test:errors       # Error classes
pnpm test:codegen      # Code generation
pnpm test:route        # Routing logic
pnpm test:client       # HTTP client
pnpm test:middleware   # Request/response handling
pnpm test:env          # Environment variables
```

**Modules**: logger, errors, codegen, route, client, middleware, env

**Config**: `vitest.unit.config.ts`
- Runs with 4 threads (parallel)
- No infrastructure dependencies
- ~380 tests in 2-3 seconds

### Integration Tests (Slow, Requires Infrastructure)

Tests that need Redis, PostgreSQL, or other services:

```bash
# Start infrastructure first
pnpm docker:test:up

# Run integration tests
pnpm test:integration  # All integration tests
pnpm test:cache        # Redis tests
pnpm test:db           # PostgreSQL tests
pnpm test:server       # Server integration

# Stop infrastructure
pnpm docker:test:down
```

**Modules**: cache, db, server

**Config**: `vitest.integration.config.ts`
- Runs with 1 thread (sequential)
- Requires Docker containers
- 30s timeout for slow operations

## Running Tests

### During Development (Recommended)

Use unit tests for fast feedback:

```bash
pnpm test:unit
```

### Before Commit

Run all tests:

```bash
pnpm test
```

### CI/CD Pipeline

```bash
# Unit tests (always run)
pnpm test:unit

# Integration tests (if Docker available)
pnpm docker:test:up
pnpm test:integration
pnpm docker:test:down
```

## Test Structure

```
src/
├── logger/
│   ├── __tests__/
│   │   ├── logger.test.ts
│   │   ├── formatters.test.ts
│   │   └── ...
│   └── ...
├── cache/
│   ├── __tests__/
│   │   ├── redis-factory.test.ts  (integration)
│   │   └── ...
└── ...
```

## Writing Tests

### Unit Test Example

```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from '../my-module';

describe('myFunction', () =>
{
    it('should do something', () =>
    {
        const result = myFunction();
        expect(result).toBe(expected);
    });
});
```

### Integration Test Example

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectToRedis } from '../redis';

describe('Redis Integration', () =>
{
    beforeAll(async () =>
    {
        // Setup infrastructure connection
        await connectToRedis();
    });

    afterAll(async () =>
    {
        // Cleanup
        await disconnectRedis();
    });

    it('should connect to Redis', async () =>
    {
        // Test with real Redis
    });
});
```

## Configuration Files

| File | Purpose | Tests | Threads | Timeout |
|------|---------|-------|---------|---------|
| `vitest.config.ts` | All tests (default) | All | 1 | 30s |
| `vitest.unit.config.ts` | Unit tests only | Unit | 4 | 5s |
| `vitest.integration.config.ts` | Integration tests | Integration | 1 | 30s |

## Test Coverage

Current status:

| Module | Files | Tests | Status |
|--------|-------|-------|--------|
| logger | 7 | 16+ | ✅ |
| errors | 6 | 10+ | ✅ |
| codegen | 8 | 15+ | ✅ |
| route | 7 | 25+ | ✅ |
| client | 2 | 10+ | ✅ |
| middleware | 4 | 5+ | ✅ |
| env | 5 | 3+ | ✅ |
| cache | 5 | 15+ | ✅ |
| **db** | **18** | **0** | ❌ **TODO** |
| server | 6 | 5+ | ✅ |

**Total**: ~380 tests, 26% coverage

**Goal**: Add db module tests to reach 60%+ coverage

## Troubleshooting

### Tests Running Slow

Use unit tests instead of all tests:
```bash
pnpm test:unit  # Fast (2-3s)
```

### Memory Issues

Vitest is configured with limited threads:
- Unit tests: max 4 threads
- Integration tests: 1 thread only
- All tests: 1 thread (sequential)

### Docker Not Available

Skip integration tests, run unit only:
```bash
pnpm test:unit
```

### Test a Single Module

```bash
pnpm test:logger  # Just logger tests
pnpm test:cache   # Just cache tests
```

## Best Practices

1. **Write unit tests first** - They're faster and easier
2. **Mock external dependencies** - Use vitest mocks
3. **Keep tests isolated** - Don't depend on other test state
4. **Use descriptive names** - Clear test and describe blocks
5. **Test edge cases** - Not just happy path
6. **Clean up resources** - Use afterEach/afterAll hooks
7. **Avoid timeouts** - Set appropriate timeout limits
8. **Run tests before commit** - Ensure nothing breaks

## Future Improvements

- [ ] Add db module tests (transaction, repository, manager)
- [ ] Increase coverage to 60%+
- [ ] Add snapshot tests for codegen output
- [ ] Add performance benchmarks
- [ ] Add E2E tests for full workflows