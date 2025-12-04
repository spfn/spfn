# @spfn/core/logger - Logging Infrastructure

Universal logging module with transport-based architecture.

## Core Components

```
logger/
├── index.ts              # Module exports
├── logger.ts             # Logger class
├── types.ts              # Type definitions
├── config.ts             # Configuration
├── factory.ts            # Logger factory
├── formatters.ts         # Log formatters & sensitive masking
├── transports/
│   └── console.ts        # Console transport
└── __tests__/
    ├── logger.test.ts
    ├── console-transport.test.ts
    ├── formatters.test.ts
    ├── config.test.ts
    ├── logger-context.test.ts
    └── promise-context.test.ts
```

## Features

- ✅ **Transport System**: Console transport with extensible architecture
- ✅ **Zero Dependencies**: No external logging library required
- ✅ **Browser Compatible**: Works in Next.js client/server components
- ✅ **Console Transport**: Stdout/stderr logging for Docker/K8s
- ✅ **Child Loggers**: Module-specific loggers with context
- ✅ **Sensitive Data Masking**: Automatic masking of passwords, tokens, API keys
- ✅ **Configuration Validation**: Startup validation with clear error messages
- ✅ **Environment-Aware**: Different configs per environment
- ✅ **Type-Safe**: Full TypeScript support

---

## Quick Start

### Basic Usage

```typescript
import { logger } from '@spfn/core';

// Basic logging
logger.debug('Debug message');
logger.info('Server started');
logger.warn('Warning message');
logger.error('Error occurred', error);
logger.fatal('Critical error');
```

### Module-Specific Loggers

```typescript
import { logger } from '@spfn/core';

const dbLogger = logger.child('database');
const apiLogger = logger.child('api');

dbLogger.info('Database connected');
apiLogger.info('Request received', { method: 'POST', path: '/users' });
```

### Error Logging with Context

```typescript
try {
  await someOperation();
} catch (error) {
  logger.error('Operation failed', error as Error, {
    userId: 123,
    operation: 'createUser'
  });
}
```

---

## Log Levels

Five log levels with priority order:

| Level | Priority | Use Case |
|-------|----------|----------|
| debug | 0 | Development debugging |
| info | 1 | General information (server start, etc.) |
| warn | 2 | Warnings (retries, unusual situations) |
| error | 3 | Errors (exceptions, failures) |
| fatal | 4 | Critical errors (system halt level) |

---

## Environment Configuration

### Development

```bash
NODE_ENV=development
SPFN_LOG_LEVEL=debug
```

**Output:** Colored console output

```
[2025-10-21 15:39:06.123] [pid=12345] [module=database] [userId=123] (INFO): Request received
```

### Production (Docker/K8s)

```bash
NODE_ENV=production
SPFN_LOG_LEVEL=info
```

**Output:** Plain text to stdout/stderr (Docker collects logs automatically)

```
[2025-10-21 15:39:06.123] [pid=12345] [module=api] [method=POST] [path=/users] (INFO): Request received
```

**Docker Logging:** Logs written to stdout/stderr are automatically captured by Docker and can be:
- Viewed with `docker logs <container>`
- Forwarded to centralized logging systems (CloudWatch, Stackdriver, Loki)
- Managed by Kubernetes logging infrastructure

### Production (Self-Hosted)

For self-hosted environments, use external logging systems (Loki, ELK, etc.) to collect stdout/stderr instead of file-based logging.

---

## Security Features

### Sensitive Data Masking

Automatically masks sensitive information in logs:

```typescript
logger.info('User login', {
  username: 'john',
  password: 'secret123',  // Automatically masked
  token: 'abc123'          // Automatically masked
});

// Output
[2025-10-21 15:39:06.123] [pid=12345] [module=auth] [username=john] [password=***MASKED***] [token=***MASKED***] (INFO): User login
```

**Automatically masked fields:**
- password, passwd, pwd
- token, accessToken, refreshToken
- apiKey, api_key
- secret, privateKey
- authorization, auth
- cookie, session, sessionId
- creditCard, cardNumber, cvv
- ssn, pin

---

## Environment Variables

```bash
NODE_ENV=production                       # development | production | test (affects colorization)
SPFN_LOG_LEVEL=info                       # debug | info | warn | error | fatal (default: info)
NEXT_PUBLIC_SPFN_LOG_LEVEL=info          # Client-side log level for Next.js (default: info)
```

---

## Transports

### Console Transport

- Always enabled
- stdout (debug, info) / stderr (warn, error, fatal)
- Colored in development, plain text in production
- **Docker/K8s Compatible**: Logs to stdout/stderr for container log collection

**Recommended Logging Strategy:**
- **Development**: Console with colors
- **Docker/K8s**: Console (plain text) → Container logs → Centralized system (CloudWatch, Loki, etc.)
- **Serverless**: Console (plain text) → Automatic capture by platform

---

## Log Formats

### Console Output Format

```
[timestamp] [pid=N] [module=name] [key=value]... (LEVEL): message
```

**Example:**
```
[2025-10-21 15:39:06.123] [pid=12345] [module=database] (INFO): Connection established
[2025-10-21 15:39:06.456] [pid=12345] [module=api] [userId=123] (ERROR): Request failed
Error: Connection timeout
    at processRequest (/app/src/api.ts:45:11)
```

---

## API Reference

### `logger.child(module)`

Create module-specific logger.

```typescript
const dbLogger = logger.child('database');
dbLogger.info('Connected');
```

**Returns:** `Logger`

---

### `logger.debug(message, context?)`

Debug level log.

```typescript
logger.debug('Query executed', { query: 'SELECT...', duration: 45 });
```

---

### `logger.info(message, context?)`

Info level log.

```typescript
logger.info('Server started', { port: 3000 });
```

---

### `logger.warn(message, error?, context?)`

Warning level log.

```typescript
logger.warn('Connection retry', { attempt: 3 });
logger.warn('Connection retry', error, { attempt: 3 });
```

---

### `logger.error(message, error?, context?)`

Error level log.

```typescript
logger.error('Request failed', error, { userId: 123 });
```

---

### `logger.fatal(message, error?, context?)`

Fatal level log.

```typescript
logger.fatal('Database unavailable', error);
```

---

## Performance Tips

### 1. Log Level Filtering

Logs are filtered at the source before metadata creation for optimal performance:

```typescript
// ❌ Don't worry - if level is 'info', this won't create metadata
logger.debug('Expensive operation', { data: hugeObject });

// ✅ But still, use appropriate levels
logger.info('User query completed', { count: 100, duration: 45 });
```

### 2. Use Child Loggers

```typescript
// ❌ Module name in every log
logger.info('[database] Connected');

// ✅ Create child logger once
const dbLogger = logger.child('database');
dbLogger.info('Connected');
```

### 3. Sensitive Data

Don't worry about accidentally logging sensitive data - it's automatically masked:

```typescript
// ✅ Safe - password will be masked
logger.info('Login attempt', { username: 'john', password: userInput });
```

---

## Testing

```bash
# Run all logger tests (103 tests)
pnpm test src/logger

# Run specific test files
pnpm test src/logger/__tests__/logger.test.ts
pnpm test src/logger/__tests__/console-transport.test.ts
pnpm test src/logger/__tests__/formatters.test.ts
pnpm test src/logger/__tests__/config.test.ts
pnpm test src/logger/__tests__/logger-context.test.ts
pnpm test src/logger/__tests__/promise-context.test.ts
```

**Test Coverage (103 tests):**
- ✅ Logger core (26 tests)
  - Basic logging (all levels)
  - Context logging
  - Error logging with stack traces
  - Child logger creation
  - Log level filtering
  - Sensitive data masking
- ✅ Console Transport (16 tests)
  - Enabled state handling
  - Log level filtering
  - Stream separation (stdout/stderr)
  - Colorization
- ✅ Formatters (35 tests)
  - Console formatting
  - Plain text formatting
  - Timestamp formatting
  - Sensitive data masking
- ✅ Configuration (7 tests)
  - Environment detection
  - Log level configuration
- ✅ Logger Context (6 tests)
  - Context propagation
  - Nested context handling
- ✅ Promise Context (13 tests)
  - Async context tracking
  - Promise chain context propagation

---

## Troubleshooting

### Logs not appearing

**Cause:** Log level too high

**Solution:** Check `SPFN_LOG_LEVEL` environment variable
```bash
SPFN_LOG_LEVEL=debug  # Show all logs
```

### Docker/K8s Logging

For containerized environments, logs are automatically captured from stdout/stderr:

```bash
# View container logs
docker logs <container-id>

# Follow logs in real-time
docker logs -f <container-id>

# Kubernetes logs
kubectl logs <pod-name>
```

---

## Related

- [@spfn/core](../../README.md) - Main package documentation