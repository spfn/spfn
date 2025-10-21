# @spfn/core/logger - Logging Infrastructure

Universal logging module with Adapter pattern for swappable implementations.

## Features

- ✅ **Adapter Pattern**: Switch between Pino and custom implementations
- ✅ **Zero Dependencies** (Custom adapter): No required logging library
- ✅ **High Performance** (Pino adapter): 5-10x faster than Winston
- ✅ **Multiple Transports**: Console, File, Slack, Email support
- ✅ **Child Loggers**: Module-specific loggers with context
- ✅ **File Rotation**: Date and size-based rotation with automatic cleanup
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
```

**Output:** Pretty-printed, colored console output (single line)

```
[2025-10-21 15:39:06] [module=database] INFO: Request received userId=123
```

### Production (Kubernetes)

```bash
NODE_ENV=production
LOGGER_ADAPTER=pino
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
```

**Output:** JSON to both stdout and files with rotation

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
{"level":30,"msg":"User login","username":"john","password":"***MASKED***","token":"***MASKED***"}
```

**Automatically masked fields:**
- password, passwd, pwd
- token, accessToken, refreshToken
- apiKey, api_key
- secret, privateKey
- authorization, auth
- cookie, session, sessionId
- creditCard, cardNumber, cvv
- And 10+ more patterns

---

## Configuration Validation

Logger validates configuration at startup and provides clear error messages:

```bash
# Missing LOG_DIR when file logging is enabled
Error: [Logger] Configuration validation failed: LOG_DIR environment variable is required when LOGGER_FILE_ENABLED=true

# Invalid Slack webhook URL
Error: [Logger] Configuration validation failed: Invalid SLACK_WEBHOOK_URL

# Incomplete email configuration
Error: [Logger] Configuration validation failed: Email transport configuration incomplete. Missing: SMTP_PORT, EMAIL_FROM
```

---

## Environment Variables

### Basic

```bash
NODE_ENV=production        # development | production | test
LOGGER_ADAPTER=pino        # pino | custom (default: pino)
LOG_LEVEL=info             # debug | info | warn | error | fatal
```

### File Logging

```bash
LOGGER_FILE_ENABLED=true   # Enable file logging (default: false)
LOG_DIR=/var/log/myapp     # Log directory (required when file logging enabled)
LOG_MAX_FILE_SIZE=10M      # Max file size before rotation (default: 10MB)
LOG_MAX_FILES=10           # Max number of log files to keep (default: 10)
```

### External Services (Available)

```bash
# Slack (requires valid webhook URL)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
SLACK_CHANNEL=#errors
SLACK_USERNAME=Logger Bot

# Email (requires all fields)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
EMAIL_FROM=noreply@example.com
EMAIL_TO=admin@example.com,admin2@example.com  # Comma-separated
SMTP_USER=username  # Optional
SMTP_PASSWORD=password  # Optional
```

---

## Transports

### Console Transport

- Always enabled
- stdout (debug, info) / stderr (warn, error, fatal)
- Colored in development, plain in production
- Single-line format with pino-pretty

### File Transport

- Enabled in production with `LOGGER_FILE_ENABLED=true`
- JSON format, one log entry per line
- **Date-based rotation**: New file each day (YYYY-MM-DD.log)
- **Size-based rotation**: Rotates when file exceeds maxFileSize
- **Automatic cleanup**: Keeps only maxFiles most recent files
- Async stream-based I/O for performance

**Example file structure:**
```
/var/log/myapp/
├── 2025-10-21.log         # Today (current)
├── 2025-10-21.1.log       # Rotated (size limit)
├── 2025-10-20.log         # Yesterday
├── 2025-10-19.log
...
└── 2025-10-12.log         # Oldest (will be deleted when new day arrives)
```

### Slack Transport

- Error level and above
- Production only
- Requires `SLACK_WEBHOOK_URL`
- **Status**: Configuration available, implementation in progress

### Email Transport

- Fatal level only
- Production only
- Requires SMTP configuration
- **Status**: Configuration available, implementation in progress

---

## Log Formats

### Console (Development)

```
[2025-10-21 15:39:06] [module=database] INFO: Connection established
[2025-10-21 15:39:06] [module=api] ERROR: Request failed userId=123
```

### JSON (Production)

```json
{
  "level": 30,
  "time": 1729512546000,
  "module": "database",
  "msg": "Connection established"
}
{
  "level": 50,
  "time": 1729512546001,
  "module": "api",
  "msg": "Request failed",
  "userId": 123,
  "err": {
    "type": "Error",
    "message": "Connection timeout",
    "stack": "..."
  }
}
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
# Run all logger tests (153 tests)
npm test -- src/logger

# Run specific test files
npm test -- src/logger/__tests__/logger.test.ts
npm test -- src/logger/__tests__/console-transport.test.ts
npm test -- src/logger/__tests__/file-transport.test.ts
npm test -- src/logger/__tests__/formatters.test.ts
npm test -- src/logger/__tests__/config.test.ts
```

**Test Coverage (153 tests):**
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
- ✅ File Transport (16 tests)
  - Directory creation
  - Async file writing
  - Date-based rotation
  - Size-based rotation
  - JSON format validation
- ✅ Formatters (45 tests)
  - Console formatting
  - JSON formatting
  - Slack formatting
  - Email formatting
  - Timestamp formatting
  - Sensitive data masking (14 tests)
- ✅ Configuration (50 tests)
  - Environment detection
  - Transport configuration
  - Configuration validation (16 tests)
  - External services setup

---

## Troubleshooting

### Logs not appearing

**Cause:** Log level too high

**Solution:** Check `LOG_LEVEL` or `NODE_ENV`
```bash
LOG_LEVEL=debug  # Show all logs
```

### File logging not working

**Cause:** Configuration validation failed

**Solution:** Check error message at startup
```bash
LOGGER_FILE_ENABLED=true
LOG_DIR=/var/log/myapp  # Ensure write permission
```

### Configuration validation errors

**Cause:** Missing or invalid environment variables

**Solution:** Read the error message - it tells you exactly what's wrong
```bash
# Error will show: "LOG_DIR environment variable is required when LOGGER_FILE_ENABLED=true"
# Solution: Set LOG_DIR
LOG_DIR=/var/log/myapp
```

---

## Related

- [Pino Documentation](https://getpino.io/) - High-performance logger
- [@spfn/core](../../README.md) - Main package documentation