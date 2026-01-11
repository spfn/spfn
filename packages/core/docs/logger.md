# Logger

Structured logging with context support.

## Basic Usage

```typescript
import { logger } from '@spfn/core/logger';

logger.info('User created', { userId: '123' });
logger.warn('Rate limit approaching', { remaining: 10 });
logger.error('Failed to process', { error: err.message });
logger.debug('Processing request', { path: '/api/users' });
```

## Log Levels

| Level | Usage |
|-------|-------|
| `debug` | Development debugging |
| `info` | General information |
| `warn` | Warning conditions |
| `error` | Error conditions |

## Structured Logging

```typescript
// Good - structured data
logger.info('User login', {
    userId: user.id,
    email: user.email,
    ip: request.ip
});

// Bad - string concatenation
logger.info(`User ${user.id} logged in from ${request.ip}`);
```

## Create Scoped Logger

```typescript
import { createLogger } from '@spfn/core/logger';

const userLogger = createLogger('user-service');

userLogger.info('Created user');
// Output: [user-service] Created user

const paymentLogger = createLogger('payment');
paymentLogger.error('Payment failed', { orderId: '123' });
// Output: [payment] Payment failed { orderId: '123' }
```

## Context Logging

```typescript
import { withLogContext } from '@spfn/core/logger';

// Add context to all logs in scope
await withLogContext({ requestId: '123', userId: 'abc' }, async () => {
    logger.info('Processing request');
    // Output includes: { requestId: '123', userId: 'abc' }

    await doSomething();
    logger.info('Request complete');
    // Also includes context
});
```

## Log Format

Development (pretty):
```
2024-01-15 10:30:45 INFO  User created { userId: '123', email: 'user@example.com' }
```

Production (JSON):
```json
{"timestamp":"2024-01-15T10:30:45.123Z","level":"info","message":"User created","userId":"123","email":"user@example.com"}
```

## Best Practices

```typescript
// 1. Use structured data
logger.info('Operation complete', { duration: 150, result: 'success' });

// 2. Include error details
logger.error('Request failed', {
    error: err.message,
    stack: err.stack,
    path: req.path
});

// 3. Use appropriate levels
logger.debug(...)  // Development only
logger.info(...)   // Normal operations
logger.warn(...)   // Potential issues
logger.error(...)  // Errors requiring attention

// 4. Create scoped loggers for modules
const dbLogger = createLogger('database');
const authLogger = createLogger('auth');

// 5. Don't log sensitive data
logger.info('User login', { userId: '123' });  // Good
logger.info('User login', { password: '...' }); // Bad!
```
