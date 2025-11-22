# @spfn/auth/config

Centralized authentication environment variable management module. Provides type safety, validation, and documentation for all Auth configuration.

## Features

- ✅ **Type Safe**: Full TypeScript type inference
- ✅ **Centralized**: All auth environment variables defined in one place
- ✅ **Defaults**: Sensible default values provided
- ✅ **Validation**: Automatic type conversion and validation
- ✅ **Documentation**: Description, examples, and categories for each variable
- ✅ **Backward Compatible**: Legacy environment variable names supported
- ✅ **Helper Functions**: Convenient helpers for common use cases

## Quick Start

### Basic Usage

```typescript
import { env, getSessionSecret, getJwtSecret } from '@spfn/auth/config';

// Direct environment variable access
const secret = env.SPFN_AUTH_SESSION_SECRET;
const saltRounds = env.SPFN_AUTH_BCRYPT_SALT_ROUNDS;

// Helper functions with backward compatibility
const sessionSecret = getSessionSecret(); // Handles fallbacks
const jwtSecret = getJwtSecret();
```

## Environment Variables

### Session Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SPFN_AUTH_SESSION_SECRET` | `string` | **Required** | Session encryption secret (min 32 chars) |
| `SPFN_AUTH_SESSION_TTL` | `string` | `'7d'` | Session TTL ('7d', '12h', '45m', etc.) |

### JWT Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SPFN_AUTH_JWT_SECRET` | `string` | `'dev-secret-key-change-in-production'` | JWT signing secret |
| `SPFN_AUTH_JWT_EXPIRES_IN` | `string` | `'7d'` | JWT expiration time |

### Security Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SPFN_AUTH_BCRYPT_SALT_ROUNDS` | `number` | `10` | Bcrypt cost factor (10-14 recommended) |
| `SPFN_AUTH_VERIFICATION_TOKEN_SECRET` | `string` | *(JWT secret)* | Verification token secret |

### Admin Account Configuration

| Variable | Type | Description |
|----------|------|-------------|
| `SPFN_AUTH_ADMIN_ACCOUNTS` | `string` | JSON array of admin accounts (recommended) |
| `SPFN_AUTH_ADMIN_EMAILS` | `string` | CSV list of admin emails |
| `SPFN_AUTH_ADMIN_PASSWORDS` | `string` | CSV list of admin passwords |
| `SPFN_AUTH_ADMIN_ROLES` | `string` | CSV list of admin roles |
| `SPFN_AUTH_ADMIN_EMAIL` | `string` | Single admin email |
| `SPFN_AUTH_ADMIN_PASSWORD` | `string` | Single admin password |

### API Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SPFN_API_URL` | `string` | `'http://localhost:8790'` | Base API URL |

## Runtime Configuration

### `configureAuth(config)`

Configure global auth settings at runtime.

```typescript
import { configureAuth } from '@spfn/auth/server';

configureAuth({
  sessionTtl: '30d',  // Session TTL (supports duration strings or seconds)
});
```

**Configuration Options:**

| Option | Type | Description |
|--------|------|-------------|
| `sessionTtl` | `string \| number` | Session TTL ('30d', '12h', '45m') or seconds |

**Usage Example:**

```typescript
// app/api/actions/[...path]/route.ts
import { configureAuth } from '@spfn/auth/server';

// Configure before creating proxy
configureAuth({
  sessionTtl: '30d'  // All sessions will use 30 days TTL
});

export { GET, POST, PUT, PATCH, DELETE } from '@spfn/core/nextjs/proxy';
```

**Configuration Priority:**

When determining session TTL, the following priority is used:

1. **Runtime override** - Per-session `saveSession(data, { maxAge: '12h' })`
2. **Global config** - `configureAuth({ sessionTtl: '30d' })`
3. **Environment variable** - `SPFN_AUTH_SESSION_TTL=30d`
4. **Default** - `7d` (7 days)

---

## API Reference

### Helper Functions

#### `getSessionSecret()`

Get session secret with validation and backward compatibility.

```typescript
import { getSessionSecret } from '@spfn/auth/config';

const secret = getSessionSecret();
// Priority: SPFN_AUTH_SESSION_SECRET → SESSION_SECRET → Error
```

#### `getJwtSecret()`

Get JWT secret with backward compatibility.

```typescript
import { getJwtSecret } from '@spfn/auth/config';

const secret = getJwtSecret();
// Priority: SPFN_AUTH_JWT_SECRET → JWT_SECRET → Default
```

#### `getBcryptSaltRounds()`

Get bcrypt salt rounds with backward compatibility.

```typescript
import { getBcryptSaltRounds } from '@spfn/auth/config';

const rounds = getBcryptSaltRounds();
// Priority: SPFN_AUTH_BCRYPT_SALT_ROUNDS → BCRYPT_SALT_ROUNDS → 10
```

#### `getVerificationTokenSecret()`

Get verification token secret with fallback chain.

```typescript
import { getVerificationTokenSecret } from '@spfn/auth/config';

const secret = getVerificationTokenSecret();
// Priority: SPFN_AUTH_VERIFICATION_TOKEN_SECRET → VERIFICATION_TOKEN_SECRET → JWT_SECRET
```

### Core Functions

#### `getEnvConfig()`

Get all auth environment variables.

```typescript
import { getEnvConfig } from '@spfn/auth/config';

const config = getEnvConfig();
```

#### `validateEnvConfig()`

Validate required environment variables.

```typescript
import { validateEnvConfig } from '@spfn/auth/config';

validateEnvConfig(); // Throws if validation fails
```

#### `resetEnvConfig()`

Reset environment configuration cache (testing).

```typescript
import { resetEnvConfig } from '@spfn/auth/config';

resetEnvConfig();
```

#### `getSchemaByCategory(category)`

Get schema entries by category.

```typescript
import { getSchemaByCategory } from '@spfn/auth/config';

const sessionVars = getSchemaByCategory('session');
const jwtVars = getSchemaByCategory('jwt');
```

#### `getCategories()`

Get all environment variable categories.

```typescript
import { getCategories } from '@spfn/auth/config';

const categories = getCategories();
// ['session', 'jwt', 'security', 'admin', 'api', 'legacy']
```

## Example .env File

```env
# Session Configuration (Required)
SPFN_AUTH_SESSION_SECRET=your-super-secret-session-key-at-least-32-characters-long

# Session TTL (Optional)
SPFN_AUTH_SESSION_TTL=7d

# JWT Configuration (Optional)
SPFN_AUTH_JWT_SECRET=your-jwt-secret-key-here
SPFN_AUTH_JWT_EXPIRES_IN=7d

# Security (Optional)
SPFN_AUTH_BCRYPT_SALT_ROUNDS=10
SPFN_AUTH_VERIFICATION_TOKEN_SECRET=your-verification-secret

# Admin Accounts (Choose one method)
# Method 1: JSON array (recommended for multiple admins)
SPFN_AUTH_ADMIN_ACCOUNTS=[{"email":"admin@example.com","password":"secure-pass","role":"admin"}]

# Method 2: CSV format (legacy)
SPFN_AUTH_ADMIN_EMAILS=admin@example.com,user@example.com
SPFN_AUTH_ADMIN_PASSWORDS=admin-pass,user-pass
SPFN_AUTH_ADMIN_ROLES=admin,user

# Method 3: Single admin (simplest)
SPFN_AUTH_ADMIN_EMAIL=admin@example.com
SPFN_AUTH_ADMIN_PASSWORD=secure-password

# API Configuration
SPFN_API_URL=https://api.example.com
```

## Backward Compatibility

All legacy environment variable names are supported:

- `SESSION_SECRET` → `SPFN_AUTH_SESSION_SECRET`
- `JWT_SECRET` → `SPFN_AUTH_JWT_SECRET`
- `JWT_EXPIRES_IN` → `SPFN_AUTH_JWT_EXPIRES_IN`
- `BCRYPT_SALT_ROUNDS` → `SPFN_AUTH_BCRYPT_SALT_ROUNDS`
- `VERIFICATION_TOKEN_SECRET` → `SPFN_AUTH_VERIFICATION_TOKEN_SECRET`
- `ADMIN_*` → `SPFN_AUTH_ADMIN_*`

## Migration Guide

### From Direct process.env Access

**Before:**
```typescript
const secret = process.env.SPFN_AUTH_SESSION_SECRET || process.env.SESSION_SECRET;
const saltRounds = parseInt(process.env.SPFN_AUTH_BCRYPT_SALT_ROUNDS || '10', 10);
```

**After:**
```typescript
import { getSessionSecret, getBcryptSaltRounds } from '@spfn/auth/config';

const secret = getSessionSecret();
const saltRounds = getBcryptSaltRounds();
```

## Related

- [@spfn/core/env](../../../core/src/env/README.md) - Environment variable utilities
- [@spfn/core/config](../../../core/src/config/README.md) - Core package configuration
- [@spfn/cms/config](../../../cms/src/config/README.md) - CMS package configuration

## License

MIT