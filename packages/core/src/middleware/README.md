# @spfn/core/middleware - HTTP Middleware

HTTP middleware collection for API request/response handling and error management.

## Features

- ✅ **Error Handler**: Automatic error-to-HTTP response conversion
- ✅ **Request Logger**: Automatic API request/response logging
- ✅ **Request ID**: Distributed tracing support
- ✅ **Performance Monitoring**: Response time tracking and slow request detection
- ✅ **Sensitive Data Masking**: Automatic masking of passwords, tokens, etc.
- ✅ **Type-Safe**: Full TypeScript support

---

## Quick Start

### Error Handler

```typescript
import { Hono } from 'hono';
import { errorHandler } from '@spfn/core';

const app = new Hono();

// Apply error handler
app.onError(errorHandler());
```

### Request Logger

```typescript
import { RequestLogger } from '@spfn/core';

// Apply request logger
app.use('/*', RequestLogger());

// With custom configuration
app.use('/*', RequestLogger({
  excludePaths: ['/health', '/metrics'],
  slowRequestThreshold: 500
}));
```

---

## Error Handler

Converts custom errors to appropriate HTTP responses with automatic logging.

### Features

- **Automatic Error Conversion**: DatabaseError → HTTP status codes
- **Environment-Aware**: Stack traces in development only
- **Smart Logging**: 4xx = warn, 5xx = error
- **Type-Safe**: Full TypeScript error handling

### Basic Usage

```typescript
import { errorHandler } from '@spfn/core';

app.onError(errorHandler());
```

### Configuration Options

```typescript
app.onError(errorHandler({
  includeStack: true,        // Include stack trace (default: dev only)
  enableLogging: true        // Enable error logging (default: true)
}));
```

### Error Response Format

**Development:**
```json
{
  "error": {
    "message": "User not found",
    "type": "NotFoundError",
    "statusCode": 404,
    "stack": "Error: User not found\n    at /app/routes/users.ts:45:11"
  }
}
```

**Production:**
```json
{
  "error": {
    "message": "User not found",
    "type": "NotFoundError",
    "statusCode": 404
  }
}
```

### Error Logging

The error handler automatically logs errors based on status code:

**4xx Errors (Client Errors) - Logged as Warning:**
```json
{
  "level": "warn",
  "module": "error-handler",
  "msg": "Client error occurred",
  "type": "NotFoundError",
  "message": "User not found",
  "statusCode": 404,
  "path": "/users/123",
  "method": "GET"
}
```

**5xx Errors (Server Errors) - Logged as Error:**
```json
{
  "level": "error",
  "module": "error-handler",
  "msg": "Database error occurred",
  "type": "DatabaseConnectionError",
  "message": "Connection pool exhausted",
  "statusCode": 500,
  "path": "/users",
  "method": "POST"
}
```

### Custom Error Handling

```typescript
import { DatabaseError } from '@spfn/core';

export async function GET(c: Context) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId)
  });

  if (!user) {
    // Will be converted to 404 response
    throw new NotFoundError('User not found');
  }

  return c.json(user);
}
```

---

## Request Logger

Automatically logs all API requests with performance tracking and error monitoring.

### Features

- **Automatic Logging**: No manual logging needed
- **Request ID**: Unique ID for distributed tracing
- **Performance Tracking**: Response time measurement
- **Slow Request Detection**: Automatic warnings for slow requests
- **Error Tracking**: Automatic error logging
- **Sensitive Data Masking**: Mask passwords, tokens, etc.
- **Path Exclusion**: Skip health checks and other paths

### Basic Usage

```typescript
import { RequestLogger } from '@spfn/core';

app.use('/*', RequestLogger());
```

### Configuration Options

```typescript
app.use('/*', RequestLogger({
  // Paths to exclude from logging
  excludePaths: ['/health', '/ping', '/favicon.ico'],

  // Fields to mask (passwords, tokens, etc.)
  sensitiveFields: ['password', 'token', 'apiKey', 'secret'],

  // Slow request threshold (ms)
  slowRequestThreshold: 1000
}));
```

### Request ID

Every request gets a unique ID for distributed tracing:

```typescript
export async function POST(c: Context) {
  // Access request ID
  const requestId = c.get('requestId');

  logger.info('Processing user creation', { requestId });

  return c.json({ requestId, userId: 123 });
}
```

### Log Output Examples

**Request Received:**
```json
{
  "level": "info",
  "module": "api",
  "msg": "Request received",
  "requestId": "req_1759541628730_qsm7esvo7",
  "method": "POST",
  "path": "/users",
  "ip": "127.0.0.1",
  "userAgent": "Mozilla/5.0..."
}
```

**Request Completed (Success):**
```json
{
  "level": "info",
  "module": "api",
  "msg": "Request completed",
  "requestId": "req_1759541628730_qsm7esvo7",
  "method": "POST",
  "path": "/users",
  "status": 201,
  "duration": 45
}
```

**Request Completed (4xx Warning):**
```json
{
  "level": "warn",
  "module": "api",
  "msg": "Request completed",
  "requestId": "req_1759541628735_xn79oj7yc",
  "method": "GET",
  "path": "/not-found",
  "status": 404,
  "duration": 2
}
```

**Slow Request Detected:**
```json
{
  "level": "warn",
  "module": "api",
  "msg": "Slow request detected",
  "requestId": "req_1759541628739_63j84fp2j",
  "method": "GET",
  "path": "/slow-endpoint",
  "duration": 1250,
  "threshold": 1000
}
```

**Request Failed (Error):**
```json
{
  "level": "error",
  "module": "api",
  "msg": "Request failed",
  "requestId": "req_1759541628740_abc123xyz",
  "method": "POST",
  "path": "/users",
  "duration": 23,
  "error": {
    "type": "DatabaseError",
    "message": "Connection failed"
  }
}
```

### Sensitive Data Masking

Automatically masks sensitive fields in logged data:

```typescript
import { maskSensitiveData } from '@spfn/core';

const data = {
  username: 'john',
  password: 'secret123',
  email: 'john@example.com',
  apiKey: 'sk_live_abc123'
};

const masked = maskSensitiveData(data, ['password', 'apiKey']);
// {
//   username: 'john',
//   password: '***MASKED***',
//   email: 'john@example.com',
//   apiKey: '***MASKED***'
// }
```

---

## Complete Example

```typescript
import { Hono } from 'hono';
import { errorHandler, RequestLogger } from '@spfn/core';
import { NotFoundError } from '@spfn/core';

const app = new Hono();

// Apply middleware
app.use('/*', RequestLogger({
  excludePaths: ['/health'],
  slowRequestThreshold: 500
}));

app.onError(errorHandler({
  includeStack: process.env.NODE_ENV !== 'production'
}));

// Routes
app.get('/users/:id', async (c) => {
  const requestId = c.get('requestId');
  const userId = c.req.param('id');

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId)
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  return c.json({ requestId, user });
});

export default app;
```

**Request Flow:**

1. **Request Received** → Logged with Request ID
2. **Processing** → Business logic executes
3. **Error Thrown** → Caught and logged by Request Logger
4. **Error Handler** → Converts to HTTP response
5. **Response Sent** → Logged with duration

**Log Output:**
```json
{"level":"info","module":"api","msg":"Request received","requestId":"req_123","method":"GET","path":"/users/999"}
{"level":"error","module":"api","msg":"Request failed","requestId":"req_123","duration":12,"error":"User not found"}
{"level":"warn","module":"error-handler","msg":"Client error occurred","type":"NotFoundError","statusCode":404}
```

---

## Performance Monitoring

### Slow Request Detection

Automatically warns when requests exceed threshold:

```typescript
app.use('/*', RequestLogger({
  slowRequestThreshold: 500  // Warn if request takes > 500ms
}));
```

**Output:**
```json
{
  "level": "warn",
  "msg": "Slow request detected",
  "path": "/api/heavy-computation",
  "duration": 1250,
  "threshold": 500
}
```

### Response Time Tracking

Every request logs its duration:

```json
{
  "msg": "Request completed",
  "path": "/users",
  "duration": 45,
  "status": 200
}
```

---

## Best Practices

### 1. Apply Middleware in Correct Order

```typescript
// ✅ Correct order
app.use('/*', RequestLogger());           // 1. Log first
app.use('/*', otherMiddleware());         // 2. Other middleware
app.onError(errorHandler());              // 3. Error handler last
```

### 2. Exclude Health Check Endpoints

```typescript
// ✅ Reduce noise in logs
app.use('/*', RequestLogger({
  excludePaths: ['/health', '/ping', '/metrics']
}));
```

### 3. Use Request ID for Tracing

```typescript
// ✅ Include request ID in all logs
export async function POST(c: Context) {
  const requestId = c.get('requestId');

  logger.info('Starting transaction', { requestId });
  await processData();
  logger.info('Transaction complete', { requestId });

  return c.json({ requestId, result: 'success' });
}
```

### 4. Set Appropriate Slow Threshold

```typescript
// ✅ Based on your SLA
app.use('/*', RequestLogger({
  slowRequestThreshold: 200   // API target: < 200ms
}));
```

### 5. Enable Stack Traces in Development

```typescript
// ✅ Environment-aware configuration
app.onError(errorHandler({
  includeStack: process.env.NODE_ENV !== 'production'
}));
```

---

## Environment Variables

No environment variables required. Configuration is code-based.

---

## API Reference

### `errorHandler(options?)`

**Options:**
- `includeStack?: boolean` - Include stack trace (default: dev only)
- `enableLogging?: boolean` - Enable error logging (default: true)

**Returns:** Hono error handler function

---

### `RequestLogger(config?)`

**Config:**
- `excludePaths?: string[]` - Paths to exclude (default: `['/health', '/ping', '/favicon.ico']`)
- `sensitiveFields?: string[]` - Fields to mask (default: `['password', 'token', 'apiKey', 'secret', 'authorization']`)
- `slowRequestThreshold?: number` - Slow request threshold in ms (default: 1000)

**Returns:** Hono middleware function

---

### `maskSensitiveData(obj, sensitiveFields)`

**Parameters:**
- `obj: any` - Object to mask
- `sensitiveFields: string[]` - Field names to mask

**Returns:** Masked object with sensitive fields replaced by `***MASKED***`

---

## Related

- [Error Module](../errors/README.md) - Custom error classes
- [Logger Module](../logger/README.md) - Logging infrastructure
- [@spfn/core](../../README.md) - Main package documentation