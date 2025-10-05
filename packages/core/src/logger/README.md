# @spfn/core/logger - Logging Infrastructure

Universal logging module with Adapter pattern for swappable implementations.

## Features

- ✅ **Adapter Pattern**: Switch between Pino and custom implementations
- ✅ **Zero Dependencies** (Custom adapter): No required logging library
- ✅ **High Performance** (Pino adapter): 5-10x faster than Winston
- ✅ **Multiple Transports**: Console, File, Slack, Email support
- ✅ **Child Loggers**: Module-specific loggers with context
- ✅ **File Rotation**: Automatic log rotation by size and date
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

## Adapter Pattern

Switch logging implementation via environment variable without changing code.

```bash
# .env
LOGGER_ADAPTER=pino    # Use Pino (default, high performance)
LOGGER_ADAPTER=custom  # Use custom implementation (no dependencies)
```

### Supported Adapters

| Adapter | Performance | Use Case | Dependencies |
|---------|-------------|----------|--------------|
| **Pino** | ⚡⚡⚡⚡⚡ | Production (default) | pino, pino-pretty |
| **Custom** | ⚡⚡⚡ | Full control needed | None (self-implemented) |

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
LOGGER_ADAPTER=pino
# File logging disabled by default
```

**Output:** Pretty-printed, colored console output

```
[2025-10-04 10:15:23.456] INFO  (module: api): Request received
    method: "POST"
    path: "/users"
```

### Production (Kubernetes)

```bash
NODE_ENV=production
LOGGER_ADAPTER=pino
# File logging disabled (use stdout → log collector)
```

**Output:** JSON to stdout

```json
{"level":30,"time":1759539501259,"module":"api","msg":"Request received","method":"POST","path":"/users"}
```

### Production (Self-Hosted)

```bash
NODE_ENV=production
LOGGER_ADAPTER=pino
LOGGER_FILE_ENABLED=true
LOG_DIR=/var/log/myapp
LOG_MAX_FILE_SIZE=50M
LOG_MAX_FILES=30
```

**Output:** JSON to both stdout and files with rotation

---

## Deployment Scenarios

### Scenario 1: Kubernetes (Recommended)

```yaml
# deployment.yaml
env:
  - name: NODE_ENV
    value: "production"
  - name: LOGGER_ADAPTER
    value: "pino"
```

**Flow:**
```
App → Stdout (JSON)
      ↓
  Pod Logs
      ↓
  Fluentd/Promtail
      ↓
  Loki/Elasticsearch
      ↓
  Grafana/Kibana
```

**Benefits:**
- No disk management needed
- Auto centralized logging
- Logs preserved on container restart
- Unified view across pods

### Scenario 2: Self-Hosted (VM/Bare Metal)

```bash
LOGGER_FILE_ENABLED=true
LOG_DIR=/var/log/myapp
```

**Flow:**
```
App → Stdout + File (with rotation)
      ↓           ↓
   Console    /var/log/myapp/
              ├── app.log (current)
              ├── app.log.1 (yesterday)
              └── ...
```

**Benefits:**
- Local file storage
- Automatic rotation
- Compliance requirements (local retention)

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

## Advanced Usage

### Request Logger Middleware

Automatically logs all HTTP requests.

```typescript
import { RequestLogger } from '@spfn/core';

app.use('/*', RequestLogger({
  excludePaths: ['/health', '/ping'],
  slowRequestThreshold: 500  // Warn if > 500ms
}));
```

**Features:**
- Auto Request ID generation
- Response time tracking
- Slow request detection
- Auto error logging

**Output:**
```json
{"level":30,"module":"api","requestId":"req_123","method":"POST","path":"/users","msg":"Request received"}
{"level":30,"module":"api","requestId":"req_123","status":201,"duration":45,"msg":"Request completed"}
```

### Transaction Logger

Automatically logs transaction lifecycle.

```typescript
import { Transactional } from '@spfn/core';

export const middlewares = [Transactional()];
```

**Output:**
```json
{"level":20,"module":"transaction","txId":"tx_123","msg":"Transaction started"}
{"level":20,"module":"transaction","txId":"tx_123","duration":"45ms","msg":"Transaction committed"}
```

### Database Connection

```typescript
import { logger } from '@spfn/core';

const dbLogger = logger.child('database');

export async function connect() {
  try {
    dbLogger.info('Connecting to database...');
    const client = await createConnection();
    dbLogger.info('Database connected');
    return client;
  } catch (error) {
    dbLogger.error('Connection failed', error as Error, {
      host: process.env.DB_HOST
    });
    throw error;
  }
}
```

---

## Environment Variables

### Basic

```bash
NODE_ENV=production        # development | production | test
LOGGER_ADAPTER=pino        # pino | custom (default: pino)
LOG_LEVEL=info             # debug | info | warn | error | fatal
```

### File Logging (Self-Hosted)

```bash
LOGGER_FILE_ENABLED=true   # Enable file logging (default: false)
LOG_DIR=/var/log/myapp     # Log directory (default: ./logs)
LOG_MAX_FILE_SIZE=50M      # Max file size (default: 10M)
LOG_MAX_FILES=30           # Max files to keep (default: 10)
```

### External Services (Future)

```bash
# Slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
SLACK_CHANNEL=#errors

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
EMAIL_FROM=noreply@example.com
EMAIL_TO=admin@example.com
```

---

## Transports

### Console Transport

- Always enabled
- stdout (debug, info) / stderr (warn, error, fatal)
- Colored in development, plain in production

### File Transport

- Enabled in production with `LOGGER_FILE_ENABLED=true`
- JSON format
- Daily rotation
- Size-based rotation

### Slack Transport (Planned)

- Error level and above
- Production only

### Email Transport (Planned)

- Fatal level only
- Production only

---

## Log Formats

### Console (Development)

```
2025-10-04 09:42:03.658 INFO  [database] Connection established
2025-10-04 09:42:03.660 ERROR [api] Request failed
{
  "userId": 123,
  "path": "/users"
}
Error: Connection timeout
    at /path/to/file.ts:123:45
```

### JSON (Production)

```json
{
  "timestamp": "2025-10-04T09:42:03.658Z",
  "level": "info",
  "module": "database",
  "message": "Connection established"
}
{
  "timestamp": "2025-10-04T09:42:03.660Z",
  "level": "error",
  "module": "api",
  "message": "Request failed",
  "context": {
    "userId": 123,
    "path": "/users"
  },
  "error": {
    "name": "Error",
    "message": "Connection timeout",
    "stack": "..."
  }
}
```

---

## Performance Tips

### 1. Use Appropriate Log Levels

```typescript
// ❌ Don't log everything in production
logger.debug('Query: SELECT * FROM users WHERE id = ?', { id: 123 });

// ✅ Use info/warn/error in production
logger.info('User query completed', { count: 100, duration: 45 });
```

### 2. Avoid Expensive Operations

```typescript
// ❌ Don't serialize large objects
logger.debug('Data', { data: hugeObject });

// ✅ Log only necessary fields
logger.debug('Processing', { id: data.id, type: data.type });
```

### 3. Use Child Loggers

```typescript
// ❌ Module name in every log
logger.info('[database] Connected');

// ✅ Create child logger once
const dbLogger = logger.child('database');
dbLogger.info('Connected');
```

---

## Testing

```bash
# Logger tests
npm test -- src/tests/logger/

# Request Logger Middleware tests
npm test -- src/tests/middleware/request-logger.test.ts
```

**Test Coverage:**
- ✅ Basic logging (all levels)
- ✅ Context logging
- ✅ Error logging
- ✅ Child logger creation
- ✅ Request middleware integration
- ✅ Transaction logging

---

## Troubleshooting

### Logs not appearing

**Cause:** Log level too high

**Solution:** Check `LOG_LEVEL` or `NODE_ENV`
```bash
LOG_LEVEL=debug  # Show all logs
```

### File logging not working

**Cause:** Not enabled or permission issues

**Solution:**
```bash
LOGGER_FILE_ENABLED=true
LOG_DIR=/var/log/myapp  # Ensure write permission
```

### Performance issues

**Cause:** Too many debug logs in production

**Solution:**
```bash
NODE_ENV=production  # Auto sets level to 'info'
```

---

## Related

- [Pino Documentation](https://getpino.io/) - High-performance logger
- [Request Logger Middleware](../middleware/README.md) - Auto HTTP logging
- [@spfn/core](../../README.md) - Main package documentation