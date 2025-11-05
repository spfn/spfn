---
title: "Logger"
description: "Complete API reference for the SPFN logger module with transport-based architecture"
order: 6
available: true
---

# Logger

SPFN provides a flexible, transport-based logging system with support for console, file, Slack, and email outputs. The logger automatically handles sensitive data masking, child loggers for module-specific logging, and environment-based configuration.

## Architecture

The logger uses a simple transport-based architecture:

```
Logger → Transports (Console, File, Slack, Email)
```

Each transport can be independently configured with its own log level and enabled/disabled state.

## Basic Usage

### Import

```typescript
import { logger } from '@spfn/core';
```

### Logging Methods

```typescript
// Debug - Development diagnostics
logger.debug('Connecting to database...', { host: 'localhost', port: 5432 });

// Info - General information
logger.info('Server started successfully', { port: 3000 });

// Warn - Warning conditions
logger.warn('High memory usage detected', { usage: '85%' });

// Error - Error conditions
logger.error('Database query failed', new Error('Connection timeout'));
logger.error('Failed to process request', { userId: 123 });

// Fatal - Critical errors that may cause shutdown
logger.fatal('Out of memory', new Error('Heap overflow'));
```

### Child Loggers

Create module-specific loggers with automatic context:

```typescript
// Create child logger for a module
const dbLogger = logger.child('database');
const apiLogger = logger.child('api');

// Logs will include module name
dbLogger.info('Connection established');
// Output: [2024-01-15 10:30:00] [module=database] (INFO): Connection established

apiLogger.error('Request failed', new Error('Timeout'));
// Output: [2024-01-15 10:30:01] [module=api] (ERROR): Request failed
//         Error: Timeout
//         at ...
```

### Error Logging

```typescript
try {
  await riskyOperation();
} catch (error) {
  // Log error with context
  logger.error('Operation failed', error, {
    userId: user.id,
    operation: 'payment',
    amount: 100.00
  });
}
```

## Configuration

### Environment Variables

#### General

- `NODE_ENV` - Environment mode (development, production, test)
- `LOG_LEVEL` - Minimum log level (debug, info, warn, error, fatal)

#### Console Transport

Always enabled. Automatically configured based on environment:
- Development: Colored output with debug level
- Production: Plain JSON output with info level

#### File Transport

- `LOGGER_FILE_ENABLED` - Enable file logging (default: true in production)
- `LOG_DIR` - Log directory path (required if file logging enabled)

```bash
# Enable file logging
LOGGER_FILE_ENABLED=true
LOG_DIR=/var/log/myapp
```

#### Slack Transport

- `SLACK_WEBHOOK_URL` - Slack incoming webhook URL
- `SLACK_CHANNEL` - Channel to send logs (optional)
- `SLACK_USERNAME` - Bot username (optional, default: "Logger Bot")

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
SLACK_CHANNEL=#alerts
SLACK_USERNAME=MyApp Logger
```

#### Email Transport

- `SMTP_HOST` - SMTP server host
- `SMTP_PORT` - SMTP server port
- `SMTP_USER` - SMTP username (optional)
- `SMTP_PASSWORD` - SMTP password (optional)
- `EMAIL_FROM` - Sender email address
- `EMAIL_TO` - Recipient email addresses (comma-separated)

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=myapp@gmail.com
SMTP_PASSWORD=app_password
EMAIL_FROM=alerts@myapp.com
EMAIL_TO=admin@myapp.com,ops@myapp.com
```

### Transport Levels

Each transport has a default minimum log level:

| Transport | Default Level | Description |
|-----------|---------------|-------------|
| Console | `debug` | All logs in development |
| File | `info` | Info and above in production |
| Slack | `error` | Errors and fatal only |
| Email | `fatal` | Critical errors only |

### Default Behavior by Environment

#### Development
```typescript
{
  level: 'debug',
  transports: [
    ConsoleTransport({ colorize: true })  // Enabled
    // FileTransport - Disabled
    // SlackTransport - Disabled
    // EmailTransport - Disabled
  ]
}
```

#### Production
```typescript
{
  level: 'info',
  transports: [
    ConsoleTransport({ colorize: false }), // JSON output
    FileTransport({ logDir: '/var/log/myapp' }), // If configured
    SlackTransport({ level: 'error' }), // If configured
    EmailTransport({ level: 'fatal' })  // If configured
  ]
}
```

## Log Levels

Log levels in order of priority (lowest to highest):

| Level | Priority | Usage |
|-------|----------|-------|
| `debug` | 0 | Development diagnostics, verbose output |
| `info` | 1 | General information, normal operations |
| `warn` | 2 | Warning conditions, potential issues |
| `error` | 3 | Error conditions, failures |
| `fatal` | 4 | Critical errors requiring immediate attention |

Logs below the configured level are filtered out. For example, if `level: 'warn'` is set, only `warn`, `error`, and `fatal` logs will be processed.

## Sensitive Data Masking

The logger automatically masks sensitive fields in context objects to prevent credential leaks:

```typescript
logger.info('User logged in', {
  email: 'user@example.com',
  password: 'secret123',  // Masked as '***'
  apiKey: 'sk_live_123',  // Masked as '***'
  token: 'jwt_token_here' // Masked as '***'
});

// Output:
// [2024-01-15 10:30:00] (INFO): User logged in
// [email=user@example.com] [password=***] [apiKey=***] [token=***]
```

### Masked Fields

The following field names are automatically masked (case-insensitive):
- `password`
- `passwd`
- `pwd`
- `secret`
- `token`
- `apiKey`
- `api_key`
- `accessToken`
- `access_token`
- `refreshToken`
- `refresh_token`
- `privateKey`
- `private_key`
- `creditCard`
- `credit_card`
- `ssn`

## API Reference

### Logger Class

#### Methods

##### `debug(message: string, context?: Record<string, unknown>): void`

Log debug information for development diagnostics.

```typescript
logger.debug('Query executed', { sql: 'SELECT * FROM users', duration: 45 });
```

##### `info(message: string, context?: Record<string, unknown>): void`

Log general information about normal operations.

```typescript
logger.info('Server started', { port: 3000, env: 'production' });
```

##### `warn(message: string, context?: Record<string, unknown>): void`
##### `warn(message: string, error: Error, context?: Record<string, unknown>): void`

Log warning conditions or potential issues.

```typescript
logger.warn('High memory usage', { usage: 85.5 });
logger.warn('Retry attempt', new Error('Connection failed'), { attempt: 3 });
```

##### `error(message: string, context?: Record<string, unknown>): void`
##### `error(message: string, error: Error, context?: Record<string, unknown>): void`

Log error conditions and failures.

```typescript
logger.error('Payment failed', { userId: 123, amount: 100 });
logger.error('Database error', new Error('Connection timeout'), { query: 'INSERT' });
```

##### `fatal(message: string, context?: Record<string, unknown>): void`
##### `fatal(message: string, error: Error, context?: Record<string, unknown>): void`

Log critical errors that may require immediate attention or cause shutdown.

```typescript
logger.fatal('Out of memory', new Error('Heap overflow'));
logger.fatal('Database unreachable', { attempts: 10, lastError: 'Timeout' });
```

##### `child(module: string): Logger`

Create a child logger with module context.

```typescript
const dbLogger = logger.child('database');
const apiLogger = logger.child('api');
const authLogger = logger.child('auth');
```

##### `close(): Promise<void>`

Close all transports and flush pending logs. Useful for graceful shutdown.

```typescript
// In shutdown handler
await logger.close();
```

#### Properties

##### `level: LogLevel`

Get the current log level.

```typescript
console.log(logger.level); // 'debug' | 'info' | 'warn' | 'error' | 'fatal'
```

### Types

#### LogLevel

```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
```

#### LogMetadata

```typescript
interface LogMetadata {
  timestamp: Date;
  level: LogLevel;
  message: string;
  module?: string;
  error?: Error;
  context?: Record<string, unknown>;
}
```

#### Transport

```typescript
interface Transport {
  name: string;
  level: LogLevel;
  enabled: boolean;
  log(metadata: LogMetadata): Promise<void>;
  close?(): Promise<void>;
}
```

## Server Lifecycle Integration

The logger is automatically initialized during server startup and closed during shutdown.

### Lifecycle Hooks

```typescript
// server.config.ts
export default {
  lifecycle: {
    afterInfrastructure: async () => {
      // Logger is available after infrastructure initialization
      logger.info('Infrastructure initialized');
    },

    afterStart: async ({ port }) => {
      logger.info('Server started', { port });
    },

    beforeShutdown: async () => {
      logger.info('Shutting down gracefully');
      await logger.close(); // Flush logs before shutdown
    }
  }
} satisfies ServerConfig;
```

## Best Practices

### 1. Use Child Loggers for Modules

```typescript
// src/services/payment.ts
const logger = logger.child('payment');

export async function processPayment(amount: number) {
  logger.info('Processing payment', { amount });
  // ...
}
```

### 2. Include Relevant Context

```typescript
// Good - includes useful context
logger.error('Order creation failed', {
  userId: user.id,
  productId: product.id,
  quantity: 5,
  reason: 'Insufficient stock'
});

// Bad - no context
logger.error('Order failed');
```

### 3. Use Appropriate Log Levels

```typescript
// Debug - Development only
logger.debug('Cache hit', { key: 'user:123', ttl: 300 });

// Info - Normal operations
logger.info('Email sent', { to: user.email, subject: 'Welcome' });

// Warn - Potential issues
logger.warn('API rate limit approaching', { usage: '90%', limit: 1000 });

// Error - Failures that need attention
logger.error('Payment gateway error', error, { paymentId: 'pay_123' });

// Fatal - Critical system failures
logger.fatal('Database connection lost', error);
```

### 4. Don't Log in Loops

```typescript
// Bad - creates too many logs
users.forEach(user => {
  logger.debug('Processing user', { userId: user.id });
});

// Good - log summary
logger.info('Processing users', { count: users.length });
```

### 5. Use Error Objects

```typescript
// Good - preserves stack trace
try {
  await operation();
} catch (error) {
  logger.error('Operation failed', error);
}

// Bad - loses error information
catch (error) {
  logger.error('Operation failed', { error: error.message });
}
```

## Output Examples

### Console Output (Development)

```
[2024-01-15 10:30:00.123] (DEBUG): Connecting to database...
[2024-01-15 10:30:00.456] [module=database] (INFO): Connection established
[2024-01-15 10:30:01.789] [module=api] [userId=123] (WARN): High memory usage
[2024-01-15 10:30:02.012] [module=payment] (ERROR): Payment failed
Error: Gateway timeout
    at processPayment (payment.ts:45:11)
    at async POST (route.ts:23:5)
```

### Console Output (Production - JSON)

```json
{"timestamp":"2024-01-15T10:30:00.123Z","level":"info","message":"Server started","port":3000}
{"timestamp":"2024-01-15T10:30:01.456Z","level":"warn","module":"database","message":"Connection slow","duration":2500}
{"timestamp":"2024-01-15T10:30:02.789Z","level":"error","module":"payment","message":"Payment failed","error":{"message":"Gateway timeout","stack":"Error: Gateway timeout\n    at..."}}
```

## Migration from Pino

If you were previously using pino directly, here's how to migrate:

```typescript
// Before (pino)
import pino from 'pino';
const logger = pino({ level: 'info' });

// After (SPFN logger)
import { logger } from '@spfn/core';
// No initialization needed - works out of the box
```

The SPFN logger is simpler and more focused on common use cases, with no need for external dependencies or complex configuration.

## Troubleshooting

### Logs not appearing

Check your log level configuration:
```typescript
// Ensure your log level allows the messages
console.log(logger.level); // Should be 'debug' for all logs
```

### File transport not working

Verify directory permissions:
```bash
# Check if directory exists and is writable
ls -la /var/log/myapp

# Create directory with proper permissions
mkdir -p /var/log/myapp
chmod 755 /var/log/myapp
```

### Slack notifications not sending

Verify webhook URL:
```bash
# Test webhook manually
curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"Test message"}' \
  $SLACK_WEBHOOK_URL
```

## Future Transports

The following transports are planned for future releases:

- **Database Transport** - Store logs in PostgreSQL
- **CloudWatch Transport** - AWS CloudWatch integration
- **Datadog Transport** - Datadog APM integration
- **Sentry Transport** - Error tracking with Sentry
- **Custom Transport** - Developer-defined transports

## Related

- [Middleware](/docs/api-reference/middleware) - RequestLogger middleware
- [Server Configuration](/docs/api-reference/app#lifecycle-hooks) - Lifecycle hooks
- [Error Handling](/docs/api-reference/errors) - Error types and handling