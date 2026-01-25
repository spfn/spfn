# @spfn/auth - Technical Documentation

**Version:** 0.2.0-beta.11
**Status:** Alpha - Internal Development

> **Note:** This is a technical documentation for developers working on the @spfn/auth package.
> For user-facing documentation, see [SPFN Documentation](https://spfn.dev/docs).

---

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Admin Account Setup](#6-admin-account-setup)
- [Architecture](#architecture)
- [Package Structure](#package-structure)
- [Module Exports](#module-exports)
- [Email & SMS Services](#email--sms-services)
- [Server-Side API](#server-side-api)
- [Database Schema](#database-schema)
- [RBAC System](#rbac-system)
- [Next.js Adapter](#nextjs-adapter)
- [Testing](#testing)
- [Development Workflow](#development-workflow)
- [Known Issues](#known-issues)
- [Roadmap](#roadmap)

---

## Overview

`@spfn/auth` is an authentication and authorization package for the SPFN framework, providing:

- **Asymmetric JWT Authentication** - Client-signed tokens using ES256/RS256
- **User Management** - Email/phone-based identity with bcrypt hashing
- **Multi-Factor Authentication** - OTP verification via email/SMS
- **Session Management** - Public key rotation with 90-day expiry
- **Role-Based Access Control** - Flexible RBAC with runtime role/permission management
- **Next.js Integration** - Session helpers and server-side guards

### Design Principles

1. **Security First** - Asymmetric cryptography, no shared secrets
2. **Type Safety** - Full TypeScript support with Typebox validation
3. **Framework Integration** - Seamless SPFN plugin architecture
4. **Extensibility** - Service layer for custom authentication flows
5. **Developer Experience** - Clear separation of concerns, reusable components

---

## Installation

### 1. Install Package

```bash
pnpm add @spfn/auth
```

### 2. Configure Server

#### Add Lifecycle to `server.config.ts`

```typescript
import { defineServerConfig } from '@spfn/core/server';
import { createAuthLifecycle } from '@spfn/auth/server';
import { appRouter } from './router';

export default defineServerConfig()
    .port(8790)
    .host('0.0.0.0')
    .routes(appRouter)
    .lifecycle(createAuthLifecycle())  // Add auth lifecycle
    .build();
```

#### Register Router in `router.ts`

```typescript
import { defineRouter } from '@spfn/core/route';
import { authRouter } from '@spfn/auth/server';

export const appRouter = defineRouter({
    // Auth routes (fixed namespace)
    auth: authRouter,

    // ... your other routes
});
```

### 3. Configure Client (Next.js)

#### Option A: Use the built-in `authApi` (Recommended)

```typescript
import { authApi } from '@spfn/auth';

// Type-safe API calls for auth routes
const session = await authApi.getAuthSession.call({});
```

#### Option B: Register Error Registry in Custom API Client

```typescript
import { createApi } from '@spfn/core/nextjs';
import type { AppRouter } from '@/server/router';
import { authErrorRegistry } from "@spfn/auth/errors";
import { appMetadata } from '@/server/router.metadata';
import { errorRegistry } from "@spfn/core/errors";

export const api = createApi<AppRouter>({
    metadata: appMetadata,
    errorRegistry: errorRegistry.concat(authErrorRegistry),
});
```

### 4. Environment Variables

```bash
# Required
SPFN_AUTH_JWT_SECRET=your-secret-key
SPFN_AUTH_VERIFICATION_TOKEN_SECRET=your-verification-secret
DATABASE_URL=postgresql://...

# Next.js (required)
SPFN_AUTH_SESSION_SECRET=your-32-char-secret

# Optional
SPFN_AUTH_JWT_EXPIRES_IN=7d
SPFN_AUTH_BCRYPT_SALT_ROUNDS=10
SPFN_AUTH_SESSION_TTL=7d

# AWS SES (Email)
SPFN_AUTH_AWS_REGION=ap-northeast-2
SPFN_AUTH_AWS_SES_ACCESS_KEY_ID=AKIA...
SPFN_AUTH_AWS_SES_SECRET_ACCESS_KEY=...
SPFN_AUTH_AWS_SES_FROM_EMAIL=noreply@yourdomain.com

# AWS SNS (SMS)
SPFN_AUTH_AWS_SNS_ACCESS_KEY_ID=AKIA...
SPFN_AUTH_AWS_SNS_SECRET_ACCESS_KEY=...
SPFN_AUTH_AWS_SNS_SENDER_ID=MyApp
```

### 5. Run Migrations

```bash
# Generate migrations (if needed)
pnpm spfn db generate

# Run migrations
pnpm spfn db migrate
```

### 6. Admin Account Setup

Admin accounts are automatically created on server startup via `createAuthLifecycle()`.
Choose one of the following methods:

#### Method 1: JSON Format (Recommended)

Best for multiple accounts with full configuration:

```bash
SPFN_AUTH_ADMIN_ACCOUNTS='[
  {"email": "superadmin@example.com", "password": "secure-pass-1", "role": "superadmin"},
  {"email": "admin@example.com", "password": "secure-pass-2", "role": "admin"},
  {"email": "manager@example.com", "password": "secure-pass-3", "role": "user"}
]'
```

**JSON Schema:**
```typescript
interface AdminAccountConfig {
  email: string;           // Required
  password: string;        // Required
  role?: string;           // Default: 'user' (options: 'user', 'admin', 'superadmin')
  phone?: string;          // Optional
  passwordChangeRequired?: boolean;  // Default: true
}
```

#### Method 2: CSV Format

For multiple accounts with simpler configuration:

```bash
SPFN_AUTH_ADMIN_EMAILS=admin@example.com,manager@example.com
SPFN_AUTH_ADMIN_PASSWORDS=admin-pass,manager-pass
SPFN_AUTH_ADMIN_ROLES=superadmin,admin
```

#### Method 3: Single Account (Legacy)

Simplest format for a single superadmin:

```bash
SPFN_AUTH_ADMIN_EMAIL=admin@example.com
SPFN_AUTH_ADMIN_PASSWORD=secure-password
```

> **Note:** This method always creates a `superadmin` role account.

#### Default Behavior

All admin accounts created via environment variables have:
- `emailVerifiedAt`: Auto-verified (current timestamp)
- `passwordChangeRequired`: `true` (must change on first login)
- `status`: `active`

#### Programmatic Creation

You can also create admin accounts programmatically:

```typescript
import { usersRepository, getRoleByName, hashPassword } from '@spfn/auth/server';

// After initializeAuth() has been called
const role = await getRoleByName('admin');
const passwordHash = await hashPassword('secure-password');

await usersRepository.create({
  email: 'admin@example.com',
  passwordHash,
  roleId: role.id,
  emailVerifiedAt: new Date(),
  passwordChangeRequired: true,
  status: 'active',
});
```

---

## Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     @spfn/auth Package                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐   │
│  │    Server     │  │    Next.js    │  │    Client     │   │
│  │   (server.ts) │  │   (nextjs/*)  │  │  (client.ts)  │   │
│  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘   │
│          │                   │                   │           │
│  ┌───────▼───────────────────▼───────────────────▼───────┐  │
│  │              Common Types & Entities                   │  │
│  │                   (index.ts)                           │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Module Separation

The package is split into three distinct entry points to ensure proper code separation:

1. **Common Module** (`@spfn/auth`)
   - Database entities (users, roles, permissions)
   - TypeScript types and interfaces
   - RBAC type definitions
   - Can be imported anywhere (server/client)

2. **Server Module** (`@spfn/auth/server`)
   - Server-only code (marked with Node.js APIs)
   - Routes, services, repositories
   - Middleware, helpers (JWT, password)
   - RBAC initialization
   - **Never** import in client-side code

3. **Client Module** (`@spfn/auth/client`)
   - Client-only code (React hooks, components)
   - Currently in development (placeholders only)
   - **Never** import in server-side code

4. **Next.js Adapter** (`@spfn/auth/nextjs/*`)
   - Next.js-specific integrations
   - `@spfn/auth/nextjs/api` - Interceptors for API routes
   - `@spfn/auth/nextjs/server` - Server Components guards & session helpers

### Asymmetric JWT Flow

```
┌──────────┐                                    ┌──────────┐
│  Client  │                                    │  Server  │
└────┬─────┘                                    └────┬─────┘
     │                                               │
     │ 1. Generate ES256 keypair                    │
     │    (privateKey stored locally)               │
     │                                               │
     │ 2. POST /_auth/register                      │
     │    { email, password, publicKey, keyId }     │
     ├──────────────────────────────────────────────>│
     │                                               │
     │                            3. Store publicKey │
     │                               (user_public_keys)
     │                                               │
     │ 4. Sign JWT with privateKey                  │
     │    payload: { userId, keyId }                │
     │                                               │
     │ 5. Request with Authorization header         │
     │    Authorization: Bearer <jwt>               │
     ├──────────────────────────────────────────────>│
     │                                               │
     │                      6. Decode JWT → keyId   │
     │                         Fetch publicKey      │
     │                         Verify signature     │
     │                                               │
     │                                    7. Success │
     │<──────────────────────────────────────────────┤
     │                                               │
```

**Key Points:**
- Server **never** knows the private key
- Each client has a unique keypair
- JWT verification uses stored public key
- No shared secrets (unlike HMAC-based JWT)

---

## Package Structure

```
packages/auth/
├── dist/                      # Compiled output (tsup)
│   ├── index.js              # Common exports
│   ├── index.d.ts
│   ├── server.js             # Server exports
│   ├── server.d.ts
│   ├── client.js             # Client exports (minimal)
│   ├── client.d.ts
│   ├── config/               # Configuration module
│   ├── errors/               # Error classes
│   ├── nextjs/               # Next.js adapter
│   └── server/               # Server implementation
│
├── migrations/                # Drizzle database migrations
│   └── *.sql
│
├── src/
│   ├── index.ts              # Common entry point
│   ├── server.ts             # Server entry point
│   ├── client.ts             # Client entry point
│   │
│   ├── config/               # Configuration system
│   │   ├── index.ts
│   │   ├── schema.ts         # Env var schema
│   │   └── types.ts
│   │
│   ├── errors/               # Error definitions
│   │   ├── index.ts
│   │   └── auth-errors.ts
│   │
│   ├── lib/                  # Shared code
│   │   └── contracts/        # Typebox schemas
│   │
│   ├── server/               # Server-side implementation
│   │   ├── entities/         # Drizzle ORM entities
│   │   ├── services/         # Business logic layer
│   │   ├── repositories/     # Database access layer
│   │   ├── routes/           # HTTP route handlers
│   │   ├── middleware/       # Auth middleware
│   │   ├── helpers/          # JWT, password, context
│   │   ├── rbac/             # RBAC types and builtins
│   │   ├── lib/              # Server utilities
│   │   ├── lifecycle.ts      # SPFN lifecycle hooks
│   │   ├── setup.ts          # Initialization
│   │   ├── logger.ts         # Logging
│   │   └── types.ts          # Server types
│   │
│   ├── nextjs/               # Next.js adapter
│   │   ├── api.ts            # Interceptor exports
│   │   ├── server.ts         # Server Components guards
│   │   ├── session-helpers.ts# Session management
│   │   ├── interceptors/     # Request interceptors
│   │   └── guards/           # Auth guards
│   │
│   └── client/               # Client-side (WIP)
│       ├── hooks/            # React hooks (TODO)
│       ├── store/            # Zustand store (TODO)
│       └── components/       # UI components (TODO)
│
├── package.json              # Package configuration + SPFN plugin config
├── tsup.config.ts            # Build configuration
├── drizzle.config.ts         # Database migration config
└── README.md                 # This file
```

### Layer Responsibilities

#### 1. **Routes Layer** (`src/server/routes/`)
- Thin HTTP handlers
- Request validation (Typebox)
- Delegates to services
- Returns responses

#### 2. **Services Layer** (`src/server/services/`)
- Business logic
- Transaction management
- Reusable functions
- Can be used outside of routes

#### 3. **Repositories Layer** (`src/server/repositories/`)
- Database access only
- CRUD operations
- No business logic
- Drizzle ORM queries

#### 4. **Helpers Layer** (`src/server/helpers/`)
- Utility functions (JWT, password hashing)
- Context accessors (getAuth, getUser)
- Stateless operations

---

## Module Exports

### Common Module (`@spfn/auth`)

**API Client:**
```typescript
import { authApi } from '@spfn/auth';

// Type-safe API calls
const session = await authApi.getAuthSession.call({});
const result = await authApi.login.call({
  body: { email, password, fingerprint, publicKey, keyId }
});
```

**Types:**
```typescript
import type {
  User,
  UserPublicKey,
  VerificationCode,
  Role,
  Permission,
  AuthSession,
  UserProfile,
  ProfileInfo,
  // ... etc
} from '@spfn/auth';
```

**RBAC:**
```typescript
import {
  BUILTIN_ROLES,
  BUILTIN_PERMISSIONS,
  BUILTIN_ROLE_PERMISSIONS
} from '@spfn/auth';

import type {
  RoleConfig,
  PermissionConfig,
  InitializeAuthOptions,
  BuiltinRoleName,
  BuiltinPermissionName
} from '@spfn/auth';
```

**Validation Patterns:**
```typescript
import {
  UUID_PATTERN,
  EMAIL_PATTERN,
  BASE64_PATTERN,
  FINGERPRINT_PATTERN,
  PHONE_PATTERN,
} from '@spfn/auth';
```

**Route Map (for RPC Proxy):**
```typescript
import { authRouteMap } from '@spfn/auth';

// Use in Next.js RPC proxy (app/api/rpc/[routeName]/route.ts)
import '@spfn/auth/nextjs/api';  // Auto-register auth interceptors
import { routeMap } from '@/generated/route-map';
import { authRouteMap } from '@spfn/auth';
import { createRpcProxy } from '@spfn/core/nextjs/proxy';

export const { GET, POST } = createRpcProxy({
    routeMap: { ...routeMap, ...authRouteMap }
});
```

> **Note:** Database entities (`users`, `userPublicKeys`, etc.) are exported from `@spfn/auth/server`, not the common module.

---

### Server Module (`@spfn/auth/server`)

**Router:**
```typescript
import { authRouter } from '@spfn/auth/server';

// Explicit registration in your app router
export const appRouter = defineRouter({
  auth: authRouter,  // Mounts at /_auth/*
});
```

**Services:**
```typescript
import {
  // Auth
  checkAccountExistsService,
  registerService,
  loginService,
  logoutService,
  changePasswordService,

  // Verification
  sendVerificationCodeService,
  verifyCodeService,

  // Key Management
  registerPublicKeyService,
  rotateKeyService,
  revokeKeyService,

  // User
  getUserByIdService,
  getUserByEmailService,
  getUserByPhoneService,
  updateUserService,
  updateLastLoginService,

  // RBAC
  initializeAuth,

  // Permission
  getUserPermissions,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  hasRole,
  hasAnyRole,

  // Role
  createRole,
  updateRole,
  deleteRole,
  addPermissionToRole,
  removePermissionFromRole,
  setRolePermissions,
  getAllRoles,
  getRoleByName,
  getRolePermissions,

  // Invitation
  createInvitation,
  getInvitationByToken,
  getInvitationWithDetails,
  validateInvitation,
  acceptInvitation,
  listInvitations,
  cancelInvitation,
  deleteInvitation,
  expireOldInvitations,
  resendInvitation,

  // Session
  getAuthSessionService,

  // User Profile
  getUserProfileService,
  updateUserProfileService,
} from '@spfn/auth/server';
```

**Repositories:**
```typescript
import {
  usersRepository,
  keysRepository,
  rolesRepository,
  permissionsRepository,
  verificationCodesRepository,
  invitationsRepository,
  rolePermissionsRepository,
  userPermissionsRepository,
  userProfilesRepository,
} from '@spfn/auth/server';
```

**Middleware:**
```typescript
import {
  authenticate,
  requirePermissions,
  requireAnyPermission,
  requireRole,
} from '@spfn/auth/server';

// Usage - all permissions required
app.bind(
  myContract,
  [authenticate, requirePermissions('user:delete')],
  async (c) => {
    // Handler
  }
);

// Usage - any of the permissions
app.bind(
  myContract,
  [authenticate, requireAnyPermission('content:read', 'admin:access')],
  async (c) => {
    // User has either content:read OR admin:access
  }
);
```

**Helpers:**
```typescript
import {
  // Context
  getAuth,
  getUser,
  getUserId,
  getKeyId,

  // JWT
  generateToken,       // Legacy server-signed (deprecated)
  verifyToken,         // Legacy server-signed (deprecated)
  verifyClientToken,   // Client-signed asymmetric JWT
  decodeToken,         // Decode without verification (debugging)
  verifyKeyFingerprint,

  // Password
  hashPassword,
  verifyPassword,
} from '@spfn/auth/server';
```

**Lifecycle:**
```typescript
import { createAuthLifecycle } from '@spfn/auth/server';

// SPFN plugin lifecycle hooks
const lifecycle = createAuthLifecycle();
```

---

### Client Module (`@spfn/auth/client`)

> **Status:** Work in Progress - Placeholders only

```typescript
// Currently empty exports
import {} from '@spfn/auth/client';
```

**Planned:**
- React hooks (useAuth, useSession)
- Zustand store
- UI components (LoginForm, etc.)

---

### Configuration Module (`@spfn/auth/config`)

```typescript
import { env, envSchema } from '@spfn/auth/config';

// Access environment variables (validated at startup)
console.log(env.SPFN_AUTH_JWT_SECRET);
console.log(env.SPFN_AUTH_JWT_EXPIRES_IN);
console.log(env.SPFN_AUTH_BCRYPT_SALT_ROUNDS);

// envSchema can be used for custom validation
```

---

### Errors Module (`@spfn/auth/errors`)

```typescript
import {
  // Auth namespace (contains all error classes)
  AuthError,

  // Individual error classes
  InvalidCredentialsError,
  InvalidTokenError,
  TokenExpiredError,
  KeyExpiredError,
  AccountDisabledError,
  AccountAlreadyExistsError,
  InvalidVerificationCodeError,
  InvalidVerificationTokenError,
  InvalidKeyFingerprintError,
  VerificationTokenPurposeMismatchError,
  VerificationTokenTargetMismatchError,
  InsufficientPermissionsError,
  InsufficientRoleError,

  // Error registry for client-side error handling
  authErrorRegistry,
} from '@spfn/auth/errors';
```

---

### Next.js Adapter (`@spfn/auth/nextjs/*`)

#### `@spfn/auth/nextjs/api`

```typescript
import {
  authInterceptors,
  loginRegisterInterceptor,
  generalAuthInterceptor,
  keyRotationInterceptor,
} from '@spfn/auth/nextjs/api';

// Auto-registers interceptors on import
import '@spfn/auth/nextjs/api';
```

#### `@spfn/auth/nextjs/server`

```typescript
import {
  // Guards (Server Components)
  RequireAuth,
  RequireRole,
  RequirePermission,

  // Auth Utils
  getUserRole,
  getUserPermissions,
  hasAnyRole,
  hasAnyPermission,

  // Session Helpers
  saveSession,
  getSession,
  clearSession,

  // Types
  type SessionData,
  type PublicSession,
  type SaveSessionOptions,
} from '@spfn/auth/nextjs/server';
```

**Session Helpers Usage:**
```typescript
// Save session (Server Actions / Route Handlers)
await saveSession({
  userId: '123',
  privateKey: '...',
  keyId: 'uuid',
  algorithm: 'ES256',
});

// Get session (read-only, safe in Server Components)
const session = await getSession();

// Clear session
await clearSession();
```

**Guard Usage:**
```typescript
// app/dashboard/page.tsx
import { RequireAuth } from '@spfn/auth/nextjs/server';

export default async function DashboardPage()
{
  return (
    <RequireAuth redirectTo="/login">
      <div>Protected content</div>
    </RequireAuth>
  );
}
```

---

## Email & SMS Services

> **⚠️ DEPRECATED:** Email and SMS functionality has been moved to `@spfn/notification` package.

### Migration Guide

```typescript
// Before (deprecated)
import { sendEmail, sendSMS } from '@spfn/auth/server';

// After (recommended)
import { sendEmail, sendSMS } from '@spfn/notification/server';
```

The `@spfn/notification` package provides:
- Multi-channel support (Email, SMS, Slack, Push)
- Template system with variable substitution
- Multiple provider support (AWS SES, SNS, SendGrid, Twilio, etc.)

For documentation, see `@spfn/notification` package README.

---

## Server-Side API

### Public Routes (No Authentication)

All routes are automatically registered at `/_auth/*` via SPFN plugin system.

#### `POST /_auth/exists`

Check if account exists.

**Request:**
```typescript
{
  email?: string;
  phone?: string;  // E.164 format
}
```

**Response:**
```typescript
{
  exists: boolean;
  identifier: string;
  identifierType: 'email' | 'phone';
}
```

---

#### `POST /_auth/codes`

Send verification code.

**Request:**
```typescript
{
  target: string;           // Email or phone
  targetType: 'email' | 'phone';
  purpose: 'registration' | 'login' | 'password_reset';
}
```

**Response:**
```typescript
{
  success: boolean;
  expiresAt: string;        // ISO 8601
}
```

---

#### `POST /_auth/codes/verify`

Verify OTP code.

**Request:**
```typescript
{
  target: string;
  targetType: 'email' | 'phone';
  code: string;             // 6 digits
  purpose: 'registration' | 'login' | 'password_reset';
}
```

**Response:**
```typescript
{
  valid: boolean;
  verificationToken?: string;  // 15min JWT for registration
}
```

---

#### `POST /_auth/register`

Register new user.

**Request:**
```typescript
{
  email?: string;
  phone?: string;
  verificationToken: string;  // From /codes/verify
  password: string;           // Min 8 chars
  publicKey: string;          // Base64 DER (SPKI)
  keyId: string;              // UUID v4
  fingerprint: string;        // SHA-256 hex (64 chars)
  algorithm: 'ES256' | 'RS256';
  keySize?: number;
}
```

**Response:**
```typescript
{
  userId: string;
  email?: string;
  phone?: string;
}
```

---

#### `POST /_auth/login`

User login.

**Request:**
```typescript
{
  email?: string;
  phone?: string;
  password: string;
  publicKey: string;          // New key for session
  keyId: string;
  fingerprint: string;
  oldKeyId?: string;          // Revoke previous key
  algorithm: 'ES256' | 'RS256';
  keySize?: number;
}
```

**Response:**
```typescript
{
  userId: string;
  email?: string;
  phone?: string;
  passwordChangeRequired: boolean;
}
```

---

### Authenticated Routes (Require JWT)

**Authentication:**
- Header: `Authorization: Bearer <jwt>`
- JWT payload must contain: `{ userId, keyId }`
- Server extracts `keyId` from JWT, fetches public key, verifies signature

---

#### `POST /_auth/logout`

Logout and revoke current key.

**Request:**
```typescript
{}  // Empty body
```

**Response:**
```typescript
{
  success: boolean;
}
```

---

#### `POST /_auth/keys/rotate`

Rotate public key before expiry (90 days).

**Request:**
```typescript
{
  publicKey: string;          // New public key
  keyId: string;              // New UUID
  fingerprint: string;
  algorithm: 'ES256' | 'RS256';
  keySize?: number;
}
```

**Response:**
```typescript
{
  success: boolean;
  keyId: string;
}
```

---

#### `PUT /_auth/password`

Change password.

**Request:**
```typescript
{
  currentPassword: string;
  newPassword: string;        // Min 8 chars
}
```

**Response:**
```typescript
{
  success: boolean;
}
```

---

## Database Schema

### Core Tables

#### `users`

Main user identity table.

```sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  password_change_required BOOLEAN DEFAULT false,
  role_id BIGINT REFERENCES roles(id) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'suspended')),
  email_verified_at TIMESTAMP,
  phone_verified_at TIMESTAMP,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT users_identifier_check CHECK (
    (email IS NOT NULL) OR (phone IS NOT NULL)
  )
);
```

**Key Points:**
- At least one of `email` OR `phone` required
- `passwordHash` is bcrypt ($2b$10$..., 60 chars)
- `roleId` references roles table (NOT NULL)

---

#### `user_public_keys`

Stores client public keys for JWT verification.

```sql
CREATE TABLE user_public_keys (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  key_id TEXT UNIQUE NOT NULL,
  public_key TEXT NOT NULL,
  algorithm TEXT NOT NULL CHECK (algorithm IN ('ES256', 'RS256')),
  fingerprint TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP,
  revoked_reason TEXT
);

CREATE INDEX idx_user_public_keys_user_id ON user_public_keys(user_id);
CREATE INDEX idx_user_public_keys_key_id ON user_public_keys(key_id);
CREATE INDEX idx_user_public_keys_is_active ON user_public_keys(is_active);
```

**Key Points:**
- `keyId` is client-generated UUID v4
- `fingerprint` is SHA-256(publicKey) for verification
- `expiresAt` defaults to 90 days from creation
- `isActive` determines if key can be used

---

#### `verification_codes`

OTP codes for email/SMS verification.

```sql
CREATE TABLE verification_codes (
  id BIGSERIAL PRIMARY KEY,
  target TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('email', 'phone')),
  code TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('registration', 'login', 'password_reset')),
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_verification_codes_target ON verification_codes(target);
```

**Key Points:**
- 6-digit numeric code
- Expires in 5-10 minutes (configurable)
- Single-use (marked via `usedAt`)

---

### RBAC Tables

#### `roles`

```sql
CREATE TABLE roles (
  id BIGSERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  is_builtin BOOLEAN DEFAULT false,
  is_system BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  priority INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Built-in Roles:**
- `user` (priority 10) - Default role
- `admin` (priority 80)
- `superadmin` (priority 100)

---

#### `permissions`

```sql
CREATE TABLE permissions (
  id BIGSERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  is_builtin BOOLEAN DEFAULT false,
  is_system BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Built-in Permissions:**
- `auth:self:manage`
- `user:read`, `user:write`, `user:delete`, `user:invite`
- `rbac:role:manage`, `rbac:permission:manage`

---

#### `role_permissions`

Many-to-many mapping between roles and permissions.

```sql
CREATE TABLE role_permissions (
  id BIGSERIAL PRIMARY KEY,
  role_id BIGINT REFERENCES roles(id) ON DELETE CASCADE,
  permission_id BIGINT REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(role_id, permission_id)
);
```

---

#### `user_permissions`

User-specific permission overrides.

```sql
CREATE TABLE user_permissions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  permission_id BIGINT REFERENCES permissions(id) ON DELETE CASCADE,
  granted BOOLEAN NOT NULL,
  reason TEXT,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, permission_id)
);
```

**Use Cases:**
- `granted: true` - Grant permission temporarily
- `granted: false` - Revoke permission (even if role has it)
- `expiresAt` - Temporary access with expiration

---

### Supporting Tables

#### `invitations`

User invitation system.

```sql
CREATE TABLE invitations (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  role_id BIGINT REFERENCES roles(id),
  invited_by BIGINT REFERENCES users(id),
  status TEXT CHECK (status IN ('pending', 'accepted', 'cancelled', 'expired')),
  expires_at TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

#### `user_profiles`

Extended user profile information.

```sql
CREATE TABLE user_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  first_name TEXT,
  last_name TEXT,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

#### `user_social_accounts`

OAuth provider accounts (future feature).

```sql
CREATE TABLE user_social_accounts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(provider, provider_id)
);
```

---

## RBAC System

### Initialization

```typescript
import { initializeAuth } from '@spfn/auth/server';

// Minimal setup (built-in roles only)
await initializeAuth();

// With presets
await initializeAuth({
  usePresets: true,  // Adds moderator, editor, viewer roles
});

// Custom roles and permissions
await initializeAuth({
  roles: [
    {
      name: 'content-creator',
      displayName: 'Content Creator',
      priority: 20,
    },
  ],
  permissions: [
    {
      name: 'post:create',
      displayName: 'Create Posts',
      category: 'content',
    },
  ],
  rolePermissions: {
    'content-creator': ['post:create'],
  },
});
```

---

### Built-in System

**Roles:**
- `superadmin` (priority 100) - Full access
- `admin` (priority 80) - User management
- `user` (priority 10) - Self management

**Permissions:**
- `auth:self:manage` - Change password, rotate keys
- `user:read`, `user:write`, `user:delete`, `user:invite`
- `rbac:role:manage`, `rbac:permission:manage`

---

### Middleware Usage

```typescript
import { authenticate, requirePermissions, requireAnyPermission, requireRole } from '@spfn/auth/server';

// Single permission
app.bind(
  deleteUserContract,
  [authenticate, requirePermissions('user:delete')],
  async (c) => {
    // Only users with user:delete permission
  }
);

// Multiple permissions (all required)
app.bind(
  publishPostContract,
  [authenticate, requirePermissions('post:write', 'post:publish')],
  async (c) => {
    // Needs both permissions
  }
);

// Any of the permissions (at least one required)
app.bind(
  viewContentContract,
  [authenticate, requireAnyPermission('content:read', 'admin:access')],
  async (c) => {
    // User has either content:read OR admin:access
  }
);

// Role-based
app.bind(
  adminDashboardContract,
  [authenticate, requireRole('admin', 'superadmin')],
  async (c) => {
    // Admin or superadmin only
  }
);
```

---

### Programmatic Checks

```typescript
import { hasPermission, hasRole, getUserPermissions } from '@spfn/auth/server';

const canPublish = await hasPermission(userId, 'post:publish');
const isAdmin = await hasRole(userId, 'admin');
const permissions = await getUserPermissions(userId);

if (canPublish)
{
  // Allow publish
}
```

---

### Runtime Role Management

```typescript
import { createRole, addPermissionToRole } from '@spfn/auth/server';

// Create role
const role = await createRole({
  name: 'moderator',
  displayName: 'Moderator',
  priority: 40,
  permissionIds: [1n, 2n],
});

// Add permission
await addPermissionToRole(role.id, 5n);

// Delete (system roles protected)
await deleteRole(role.id);
```

---

## Next.js Adapter

### Session Management

The Next.js adapter provides encrypted HttpOnly cookie-based sessions.

**Configuration:**
```bash
# .env
SPFN_AUTH_SESSION_SECRET=your-32-char-secret
SPFN_AUTH_SESSION_TTL=7d  # Optional, default 7d
```

**Session Data:**
```typescript
interface SessionData {
  userId: string;
  privateKey: string;    // Encrypted in cookie
  keyId: string;
  algorithm: 'ES256' | 'RS256';
}
```

---

### Server Component Guards

```typescript
// app/admin/page.tsx
import { RequireAuth, RequireRole } from '@spfn/auth/nextjs/server';

export default async function AdminPage()
{
  return (
    <RequireAuth redirectTo="/login">
      <RequireRole roles={['admin', 'superadmin']} redirectTo="/forbidden">
        <div>Admin Dashboard</div>
      </RequireRole>
    </RequireAuth>
  );
}
```

---

### Interceptors (API Routes)

**Setup:**
```typescript
// Simply import to auto-register
import '@spfn/auth/nextjs/api';
```

**How It Works:**
1. Reads `session` HttpOnly cookie
2. Unseals session data
3. Generates JWT signed with `privateKey`
4. Injects `Authorization: Bearer <jwt>` header

**Target Routes:**
- `/_auth/login`, `/_auth/register` - Login/register interceptor
- `/_auth/keys/rotate` - Key rotation interceptor
- All other authenticated routes - General auth interceptor

---

## Testing

### Setup Test Environment

```bash
# Start test database
pnpm docker:test:up

# Generate migrations
pnpm db:generate

# Run migrations (via @spfn/core)
cd ../../
pnpm spfn db migrate
```

---

### Run Tests

```bash
# All tests
pnpm test

# With coverage
pnpm test:coverage

# Route tests only
pnpm test:routes

# Watch mode
pnpm test --watch
```

---

### Test Structure

```
src/
├── __tests__/
│   └── setup.ts              # Global test setup
└── server/
    ├── routes/
    │   └── auth/
    │       └── __tests__/
    │           ├── login.test.ts
    │           ├── register.test.ts
    │           └── ...
    └── services/
        └── __tests__/
            ├── auth.service.test.ts
            └── ...
```

---

### Writing Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { loginService } from '@/server/services';

describe('loginService', () =>
{
  beforeEach(async () =>
  {
    // Setup test data
  });

  it('should login with valid credentials', async () =>
  {
    const result = await loginService({
      email: 'test@example.com',
      password: 'password123',
      publicKey: '...',
      keyId: '...',
      fingerprint: '...',
      algorithm: 'ES256',
    });

    expect(result.userId).toBeDefined();
  });
});
```

---

### Test Database

**docker-compose.test.yml:**
```yaml
services:
  postgres-test:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: spfn_auth_test
      POSTGRES_USER: spfn
      POSTGRES_PASSWORD: spfn_dev_password
    ports:
      - "5433:5432"
```

**Test env variables:**
```bash
DATABASE_URL=postgresql://spfn:spfn_dev_password@localhost:5433/spfn_auth_test
```

---

## Development Workflow

### Initial Setup

```bash
# Install dependencies
pnpm install

# Generate migrations
pnpm db:generate

# Build package
pnpm build
```

---

### Development

```bash
# Watch mode (auto-rebuild on changes)
pnpm dev

# Type checking
pnpm type-check

# Run tests
pnpm test
```

---

### Build Process

The package uses `tsup` for building:

**tsup.config.ts:**
```typescript
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    server: 'src/server.ts',
    client: 'src/client.ts',
    // ... more entry points
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
});
```

**Build outputs:**
- `dist/index.js` + `dist/index.d.ts`
- `dist/server.js` + `dist/server.d.ts`
- `dist/client.js` + `dist/client.d.ts`
- `dist/config/`, `dist/errors/`, `dist/nextjs/`

---

### Database Migrations

```bash
# Generate new migration (after entity changes)
pnpm db:generate

# Apply migrations (via SPFN CLI)
cd ../../
pnpm spfn db migrate

# View database
pnpm spfn db studio
```

**Migration files:** `migrations/*.sql`

---

### SPFN Plugin Integration

**package.json:**
```json
{
  "spfn": {
    "schemas": ["./dist/server/entities/*.js"],
    "routes": {
      "basePath": "/_auth",
      "dir": "./dist/server/routes"
    },
    "migrations": {
      "dir": "./migrations"
    }
  }
}
```

**How it works:**
1. SPFN CLI discovers packages with `spfn` field
2. Auto-loads database schemas
3. Auto-registers routes at `basePath`
4. Includes migrations in `db migrate` command

---

### Code Style

Follow the project's code style (see `/Users/launchscreen/PROJECTS/SPFN/workspaces/.claude/rules.md`):

- **Brace placement:** Next line (Allman-style)
- **Indentation:** 4 spaces
- **Semicolons:** Always
- **Type assertions:** Use `as`, not `<>`

**Example:**
```typescript
export async function myFunction(): Promise<void>
{
    if (condition)
    {
        await operation();
    }
    else
    {
        handleError();
    }
}
```

---

### Environment Variables

**Server-side:**
```bash
# Required
SPFN_AUTH_JWT_SECRET=your-secret-key
DATABASE_URL=postgresql://...

# Optional
SPFN_AUTH_JWT_EXPIRES_IN=7d
SPFN_AUTH_BCRYPT_SALT_ROUNDS=10
SPFN_AUTH_VERIFICATION_TOKEN_SECRET=separate-secret
```

**Next.js adapter:**
```bash
# Required
SPFN_AUTH_SESSION_SECRET=your-32-char-secret

# Optional
SPFN_AUTH_SESSION_TTL=7d
SPFN_API_URL=http://localhost:8790
```

---

### Debugging

**Enable logging:**
```typescript
import { serverLogger } from '@/server/logger';

serverLogger.info('Debug message', { context });
serverLogger.error('Error occurred', error);
```

**Inspect database:**
```bash
pnpm spfn db studio
```

**Check migrations:**
```bash
ls migrations/
```

---

## Known Issues

### 1. Client Crypto Functions Missing

**Issue:** README documents `generateKeyPair` and `generateClientToken` in `@spfn/auth/client`, but they only exist in `@spfn/auth/server`.

**Workaround:** Use server-side crypto functions or implement client-side crypto separately.

**Status:** Needs design decision - keep server-only or implement browser-compatible version.

---

### 2. Next.js Proxy Route Not Implemented

**Issue:** Documentation mentions `@spfn/auth/nextjs/proxy` for client-side API proxying, but it doesn't exist.

**Status:** Feature planned but not implemented. Current alternative: use server-side `createAuthInterceptor`.

---

### 3. `lib/api` Client Functions Removed

**Issue:** Old `src/lib/api/` directory was deleted during refactoring.

**Status:** Intentional removal. Use services or HTTP routes directly.

---

### 4. Test Coverage Below Target

**Current:** ~83%
**Target:** 90%+

**Areas needing tests:**
- Invitation service edge cases
- RBAC permission checks
- Key rotation scenarios
- Session expiry handling

---

## Roadmap

### Short-term (Alpha → Beta)

- [ ] **Client-side crypto** - Browser-compatible key generation
- [ ] **Next.js proxy route** - Implement or remove from docs
- [x] **High-level authApi** - Simplified Next.js auth functions (implemented in `@spfn/auth`)
- [ ] **Test coverage** - Reach 90%+ coverage
- [x] **Documentation** - Sync docs with actual code

---

### Mid-term (Beta → v1.0)

- [ ] **React hooks** - useAuth, useSession, usePermissions
- [ ] **UI components** - LoginForm, RegisterForm, AuthProvider
- [ ] **OAuth integration** - Google, GitHub, etc.
- [ ] **2FA support** - TOTP/authenticator apps
- [ ] **Password reset flow** - Complete email-based reset
- [ ] **Email change flow** - Verification for email updates
- [ ] **Phone change flow** - SMS verification for phone updates

---

### Long-term (Post v1.0)

- [ ] **Admin UI** - User/role/permission management dashboard
- [ ] **Audit logging** - Track auth events
- [ ] **Rate limiting** - Built-in protection against brute force
- [ ] **Multi-tenancy** - Organization/workspace support
- [ ] **SSO integration** - SAML, OIDC
- [ ] **Biometric auth** - WebAuthn/FIDO2 support

---

## Contributing

### Before Contributing

1. Read this documentation thoroughly
2. Check existing issues/PRs
3. Understand the architecture
4. Follow code style guidelines

---

### Pull Request Process

1. **Create feature branch**
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make changes**
   - Follow code style
   - Add tests
   - Update docs if needed

3. **Run checks**
   ```bash
   pnpm type-check
   pnpm test
   pnpm build
   ```

4. **Commit with conventional commits**
   ```bash
   git commit -m "feat(auth): add password strength validation"
   ```

5. **Push and create PR**
   ```bash
   git push origin feature/my-feature
   ```

---

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `refactor` - Code refactoring
- `test` - Test changes
- `docs` - Documentation
- `chore` - Maintenance

**Example:**
```
feat(rbac): add permission inheritance

Implement hierarchical permission inheritance where child roles
automatically inherit parent role permissions.

Closes #123
```

---

## Release Process

### Version Naming

- `0.1.0-alpha.x` - Alpha releases (current)
- `0.1.0-beta.x` - Beta releases
- `1.0.0` - Stable release

---

### Publishing

```bash
# Alpha release
pnpm run publish:alpha

# Beta release
pnpm run publish:beta

# Production release
pnpm run publish:latest
```

**Pre-publish checklist:**
- [ ] All tests pass
- [ ] Type checking passes
- [ ] Build succeeds
- [ ] CHANGELOG updated
- [ ] Version bumped
- [ ] Docs updated

---

## Support

### Internal Team

- **Issues:** GitHub Issues
- **Discussions:** GitHub Discussions
- **Slack:** #spfn-auth channel

---

## License

MIT License - See LICENSE file for details.

---

**Last Updated:** 2026-01-25
**Document Version:** 2.3.0 (Technical Documentation)
**Package Version:** 0.2.0-beta.11