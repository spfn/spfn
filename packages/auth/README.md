# @spfn/auth

![Coverage](https://img.shields.io/badge/coverage-85%2B%25-green)
![Tests](https://img.shields.io/badge/tests-226%20passed-brightgreen)

Authentication, authorization, and comprehensive RBAC module for SPFN.

## Features

- **Asymmetric JWT Authentication** - Client-signed tokens with ES256/RS256
- **User Management** - Email/phone-based identity with bcrypt password hashing
- **Multi-Factor Authentication** - 6-digit OTP via email/SMS
- **Session Management** - Public key rotation and revocation (90-day expiry)
- **Role-Based Access Control (RBAC)** - superadmin, admin, user roles
- **Account Status Management** - active, inactive, suspended states
- **Verification Flow** - Temporary tokens (15min) for secure operations
- **Type-Safe API Contracts** - Built with Typebox validation

## Architecture

### Asymmetric JWT Authentication

This package uses **client-signed JWT tokens** for enhanced security compared to traditional symmetric JWT:

```
┌─────────────┐                           ┌─────────────┐
│   Client    │                           │   Server    │
│             │                           │             │
│  1. Generate│                           │             │
│     keypair │                           │             │
│     (ES256) │                           │             │
│             │                           │             │
│  2. Register│──────────────────────────>│ 3. Store    │
│     publicKey                           │    publicKey│
│     + fingerprint                       │    (verify  │
│                                         │    fingerprint)
│             │                           │             │
│  4. Sign JWT│                           │             │
│     with    │                           │             │
│     privateKey                          │             │
│             │                           │             │
│  5. Request │──────────────────────────>│ 6. Verify   │
│     + JWT   │  Authorization: Bearer    │    signature│
│     + keyId │  X-Key-Id: uuid           │    with     │
│             │                           │    publicKey│
│             │                           │             │
│             │<──────────────────────────│ 7. Success  │
│             │   { success: true }       │             │
└─────────────┘                           └─────────────┘
```

**Key Benefits:**
- Server never knows the private key
- No shared secrets (unlike HMAC)
- Each client has unique key pair
- Easy key rotation without global impact
- Automatic 90-day key expiry

**Supported Algorithms:**
- **ES256** (ECDSA P-256) - Recommended, ~91 bytes, compact and fast
- **RS256** (RSA 2048) - Fallback, ~294 bytes, wider compatibility

## Installation

```bash
pnpm add @spfn/auth
```

## Quick Start

### 1. Client-Side Key Generation

```typescript
import { generateKeyPair } from '@spfn/auth/client';

// Generate ES256 key pair (recommended)
const keyPair = generateKeyPair('ES256');

console.log(keyPair);
// {
//   privateKey: 'MIG...',        // Base64 DER (store securely!)
//   publicKey: 'MFkw...',        // Base64 DER (send to server)
//   keyId: '550e8400-...',       // UUID v4
//   fingerprint: 'a1b2c3...',   // SHA-256 (64 hex chars)
//   algorithm: 'ES256'
// }

// Store privateKey securely in localStorage/sessionStorage
localStorage.setItem('auth.privateKey', keyPair.privateKey);
localStorage.setItem('auth.keyId', keyPair.keyId);
```

### 2. User Registration

```typescript
import { authRegister } from '@spfn/auth/api';

// Step 1: Send verification code
await authSendCode({
  target: 'user@example.com',
  targetType: 'email',
  purpose: 'registration'
});

// Step 2: Verify code and get temporary token
const { verificationToken } = await authVerifyCode({
  target: 'user@example.com',
  targetType: 'email',
  code: '123456',
  purpose: 'registration'
});

// Step 3: Register with verification token
const result = await authRegister({
  email: 'user@example.com',
  password: 'securePassword123',
  verificationToken,
  publicKey: keyPair.publicKey,
  keyId: keyPair.keyId,
  fingerprint: keyPair.fingerprint,
  algorithm: 'ES256'
});

console.log(result);
// { userId: '42', email: 'user@example.com' }
```

### 3. User Login

```typescript
import { authLogin } from '@spfn/auth/api';

// Generate new key pair for this session
const newKeyPair = generateKeyPair('ES256');

const result = await authLogin({
  email: 'user@example.com',
  password: 'securePassword123',
  publicKey: newKeyPair.publicKey,
  keyId: newKeyPair.keyId,
  fingerprint: newKeyPair.fingerprint,
  oldKeyId: localStorage.getItem('auth.keyId'), // Revoke old key
  algorithm: 'ES256'
});

// Store new credentials
localStorage.setItem('auth.privateKey', newKeyPair.privateKey);
localStorage.setItem('auth.keyId', newKeyPair.keyId);
localStorage.setItem('auth.userId', result.userId);
```

### 4. Making Authenticated Requests

```typescript
import { generateClientToken } from '@spfn/auth/client';

// Sign JWT with your private key
const privateKey = localStorage.getItem('auth.privateKey');
const keyId = localStorage.getItem('auth.keyId');
const userId = localStorage.getItem('auth.userId');

const token = generateClientToken(
  { userId, keyId, timestamp: Date.now() },
  privateKey,
  'ES256',
  { expiresIn: '15m', issuer: 'spfn-client' }
);

// Send request with Authorization header
const response = await fetch('/_auth/logout', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'X-Key-Id': keyId,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({})
});
```

### 5. Server-Side Middleware

```typescript
import { createApp } from '@spfn/core/route';
import { authenticate } from '@spfn/auth/server';
import { getAuth, getUser } from '@spfn/auth/server';

const app = createApp();

// Apply authentication middleware
app.bind(myProtectedRoute, [authenticate], async (c) => {
  // Get authenticated user
  const { user, userId, keyId } = getAuth(c);

  // Or just get user directly
  const user = getUser(c);

  console.log(user.email, user.role, user.status);

  return c.success({ message: 'Authenticated!' });
});
```

---

## Service Layer (Reusable Business Logic)

The `@spfn/auth` package provides **service functions** that encapsulate all business logic, making it easy to create custom authentication flows while reusing the same secure logic.

### Why Service Layer?

Instead of being locked into predefined API routes, you can:
- **Create custom authentication flows** that match your app's UX
- **Add custom logic** before/after authentication operations
- **Integrate with external systems** (CRM, analytics, Slack notifications)
- **Build complex workflows** combining multiple auth operations
- **Maintain consistency** by reusing the same secure business logic

### Available Services

#### Authentication Services

```typescript
import {
  checkAccountExistsService,
  registerService,
  loginService,
  logoutService,
  changePasswordService,
} from '@spfn/auth/server';
```

#### Verification Services

```typescript
import {
  sendVerificationCodeService,
  verifyCodeService,
} from '@spfn/auth/server';
```

#### Key Management Services

```typescript
import {
  registerPublicKeyService,
  rotateKeyService,
  revokeKeyService,
} from '@spfn/auth/server';
```

#### User Services

```typescript
import {
  getUserByIdService,
  getUserByEmailService,
  getUserByPhoneService,
  updateLastLoginService,
  updateUserService,
} from '@spfn/auth/server';
```

---

### Example 1: Custom Login with Slack Notification

```typescript
import { createApp } from '@spfn/core/route';
import { loginService } from '@spfn/auth/server';

const app = createApp();

app.post('/custom-login', async (c) => {
  const body = await c.req.json();

  // Log login attempt
  console.log(`Login attempt: ${body.email}`);

  try {
    // Reuse auth service
    const result = await loginService({
      email: body.email,
      password: body.password,
      publicKey: body.publicKey,
      keyId: body.keyId,
      fingerprint: body.fingerprint,
      algorithm: body.algorithm,
    });

    // Send Slack notification
    await fetch('https://hooks.slack.com/services/YOUR/WEBHOOK/URL', {
      method: 'POST',
      body: JSON.stringify({
        text: `✅ User ${result.email} logged in successfully!`,
      }),
    });

    // Track analytics
    await trackEvent('user_login', {
      userId: result.userId,
      email: result.email,
    });

    return c.json(result);
  } catch (error) {
    // Custom error handling
    await trackEvent('login_failed', { email: body.email });
    throw error;
  }
});
```

---

### Example 2: Custom Registration with CRM Integration

```typescript
import {
  verifyCodeService,
  registerService,
} from '@spfn/auth/server';

app.post('/custom-register', async (c) => {
  const body = await c.req.json();

  // Step 1: Verify OTP code
  const { verificationToken } = await verifyCodeService({
    target: body.email,
    targetType: 'email',
    code: body.otp,
    purpose: 'registration',
  });

  // Step 2: Register user
  const user = await registerService({
    email: body.email,
    password: body.password,
    verificationToken,
    publicKey: body.publicKey,
    keyId: body.keyId,
    fingerprint: body.fingerprint,
    algorithm: 'ES256',
  });

  // Step 3: Add to CRM
  await fetch('https://api.your-crm.com/contacts', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.CRM_API_KEY}` },
    body: JSON.stringify({
      email: user.email,
      userId: user.userId,
      source: 'registration',
      createdAt: new Date().toISOString(),
    }),
  });

  // Step 4: Send welcome email
  await sendWelcomeEmail(user.email);

  return c.json({
    success: true,
    userId: user.userId,
    message: 'Registration complete! Check your email for next steps.',
  });
});
```

---

### Example 3: Complex Multi-Step Flow

```typescript
import {
  checkAccountExistsService,
  sendVerificationCodeService,
  verifyCodeService,
  registerService,
} from '@spfn/auth/server';

app.post('/signup-wizard', async (c) => {
  const { step, email, code, password, publicKey, keyId, fingerprint } = await c.req.json();

  if (step === 1) {
    // Check if account already exists
    const { exists } = await checkAccountExistsService({ email });

    if (exists) {
      return c.json({ error: 'Account already exists', suggestLogin: true }, 409);
    }

    // Send verification code
    const result = await sendVerificationCodeService({
      target: email,
      targetType: 'email',
      purpose: 'registration',
    });

    return c.json({ step: 2, expiresAt: result.expiresAt });
  }

  if (step === 2) {
    // Verify code
    const { verificationToken } = await verifyCodeService({
      target: email,
      targetType: 'email',
      code,
      purpose: 'registration',
    });

    // Store token temporarily
    return c.json({ step: 3, verificationToken });
  }

  if (step === 3) {
    // Complete registration
    const user = await registerService({
      email,
      password,
      verificationToken: body.verificationToken,
      publicKey,
      keyId,
      fingerprint,
      algorithm: 'ES256',
    });

    return c.json({ success: true, userId: user.userId });
  }

  return c.json({ error: 'Invalid step' }, 400);
});
```

---

### Example 4: Check User Without Creating Route

```typescript
import { getUserByEmailService } from '@spfn/auth/server';

// Use in any server code
async function sendNotificationToAdmin(email: string) {
  const user = await getUserByEmailService(email);

  if (user && user.role === 'admin') {
    await sendEmail(user.email, 'Admin Notification', '...');
  }
}
```

---

### Service Function Signatures

#### `loginService(params)`

```typescript
await loginService({
  email?: string;              // One of email or phone required
  phone?: string;
  password: string;
  publicKey: string;
  keyId: string;
  fingerprint: string;
  oldKeyId?: string;           // Optional: revoke old key
  algorithm?: 'ES256' | 'RS256';
});

// Returns: { userId, email?, phone?, passwordChangeRequired }
```

#### `registerService(params)`

```typescript
await registerService({
  email?: string;
  phone?: string;
  verificationToken: string;   // From verifyCodeService
  password: string;
  publicKey: string;
  keyId: string;
  fingerprint: string;
  algorithm?: 'ES256' | 'RS256';
});

// Returns: { userId, email?, phone? }
```

#### `verifyCodeService(params)`

```typescript
await verifyCodeService({
  target: string;              // Email or phone
  targetType: 'email' | 'phone';
  code: string;                // 6-digit code
  purpose: 'registration' | 'login' | 'password_reset';
});

// Returns: { valid: true, verificationToken: string }
```

---

## API Reference

### Public Endpoints (No Authentication Required)

#### `POST /_auth/codes`
Send a 6-digit verification code to email or phone.

**Request:**
```typescript
{
  target: string;           // Email or phone number in E.164
  targetType: 'email' | 'phone';
  purpose: 'registration' | 'login' | 'password_reset';
}
```

**Response:**
```typescript
{
  success: boolean;
  expiresAt: string;        // ISO 8601 timestamp
}
```

---

#### `POST /_auth/codes/verify`
Verify the 6-digit code and receive a temporary token (15min validity).

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
  verificationToken?: string;  // Use for registration/password reset
}
```

---

#### `POST /_auth/exists`
Check if an account with given email/phone already exists.

**Request:**
```typescript
{
  email?: string;           // Email address
  phone?: string;           // E.164 format (e.g., +821012345678)
}
```

**Response:**
```typescript
{
  exists: boolean;
  identifier: string;       // The checked value
  identifierType: 'email' | 'phone';
}
```

---

#### `POST /_auth/register`
Register a new user account.

**Request:**
```typescript
{
  email?: string;           // One of email or phone required
  phone?: string;           // E.164 format
  verificationToken: string;  // From /codes/verify
  password: string;         // Minimum 8 characters
  publicKey: string;        // Base64 DER (SPKI format)
  keyId: string;            // UUID v4
  fingerprint: string;      // SHA-256 hex (64 chars)
  algorithm: 'ES256' | 'RS256';
  keySize?: number;         // Optional, for logging
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
Authenticate user and register new public key.

**Request:**
```typescript
{
  email?: string;           // One of email or phone required
  phone?: string;
  password: string;
  publicKey: string;        // New key for this session
  keyId: string;            // UUID v4
  fingerprint: string;      // SHA-256 hex
  oldKeyId?: string;        // Previous key to revoke
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
  passwordChangeRequired: boolean;  // If true, must change password
}
```

---

### Authenticated Endpoints (Require JWT + X-Key-Id Headers)

#### `POST /_auth/logout`
Revoke current key and logout.

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
Replace current key with a new one (before 90-day expiry).

**Request:**
```typescript
{
  publicKey: string;        // New public key
  keyId: string;            // New UUID v4
  fingerprint: string;      // New fingerprint
  algorithm: 'ES256' | 'RS256';
  keySize?: number;
}
```

**Response:**
```typescript
{
  success: boolean;
  keyId: string;            // New key ID
}
```

---

#### `PUT /_auth/password`
Change user password (requires current password).

**Request:**
```typescript
{
  currentPassword: string;
  newPassword: string;      // Minimum 8 characters
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

### Table: `users`

Main user identity table.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigserial | Primary key |
| `email` | text | Email address (unique, nullable) |
| `phone` | text | Phone in E.164 format (unique, nullable) |
| `passwordHash` | text | bcrypt hash ($2b$10$..., 60 chars) |
| `passwordChangeRequired` | boolean | Force password change on next login |
| `roleId` | bigint | Foreign key to roles.id |
| `status` | enum | `active`, `inactive`, `suspended` |
| `emailVerifiedAt` | timestamp | Email verification time |
| `phoneVerifiedAt` | timestamp | Phone verification time |
| `lastLoginAt` | timestamp | Last successful login |
| `createdAt` | timestamp | Account creation time |
| `updatedAt` | timestamp | Last update time |

**Constraints:**
- At least one of `email` OR `phone` must be provided
- Email and phone are unique when not null
- `roleId` references roles.id (NOT NULL)

---

### Table: `user_public_keys`

Stores client public keys for JWT verification.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigserial | Primary key |
| `userId` | bigint | Foreign key to users.id |
| `keyId` | text | Client-generated UUID (unique) |
| `publicKey` | text | Base64 DER encoded (SPKI) |
| `algorithm` | enum | `ES256`, `RS256` |
| `fingerprint` | text | SHA-256 hex (64 chars) |
| `isActive` | boolean | Key status (true = active) |
| `createdAt` | timestamp | Key creation time |
| `lastUsedAt` | timestamp | Last authentication time |
| `expiresAt` | timestamp | Expiry time (90 days default) |
| `revokedAt` | timestamp | Revocation time |
| `revokedReason` | text | Revocation reason |

**Indexes:**
- `userId`, `keyId`, `isActive`, `fingerprint`

---

### Table: `verification_codes`

Stores OTP codes for email/SMS verification.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigserial | Primary key |
| `target` | text | Email or phone number |
| `targetType` | enum | `email`, `phone` |
| `code` | text | 6-digit code |
| `purpose` | enum | `registration`, `login`, `password_reset`, etc. |
| `expiresAt` | timestamp | Code expiry (5-10 minutes) |
| `usedAt` | timestamp | Time code was used |
| `createdAt` | timestamp | Code creation time |

---

### Table: `user_social_accounts`

OAuth provider accounts (future feature).

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigserial | Primary key |
| `userId` | bigint | Foreign key to users.id |
| `provider` | text | OAuth provider (google, github, etc.) |
| `providerId` | text | Provider's user ID |
| `accessToken` | text | OAuth access token |
| `refreshToken` | text | OAuth refresh token |
| `expiresAt` | timestamp | Token expiry |
| `createdAt` | timestamp | Account link time |

---

### Table: `roles`

Role definitions for RBAC system.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigserial | Primary key |
| `name` | text | Role name (unique, e.g., 'admin', 'user') |
| `displayName` | text | Human-readable name |
| `description` | text | Role description |
| `isBuiltin` | boolean | Cannot be deleted (user, admin, superadmin) |
| `isSystem` | boolean | System role (cannot be deleted) |
| `isActive` | boolean | Role status |
| `priority` | integer | Role hierarchy (higher = more privileged) |
| `createdAt` | timestamp | Creation time |
| `updatedAt` | timestamp | Last update time |

**Built-in roles:**
- `user` (priority 10) - Default role
- `admin` (priority 80) - Admin role
- `superadmin` (priority 100) - Super admin

---

### Table: `permissions`

Permission definitions for RBAC system.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigserial | Primary key |
| `name` | text | Permission name (unique, e.g., 'user:delete') |
| `displayName` | text | Human-readable name |
| `description` | text | Permission description |
| `category` | text | Permission category (e.g., 'user', 'content') |
| `isBuiltin` | boolean | Built-in permission |
| `isSystem` | boolean | System permission |
| `isActive` | boolean | Permission status |
| `createdAt` | timestamp | Creation time |
| `updatedAt` | timestamp | Last update time |

**Built-in permissions:**
- `auth:self:manage` - Self auth management
- `user:read`, `user:write`, `user:delete` - User management
- `rbac:role:manage`, `rbac:permission:manage` - RBAC management

---

### Table: `role_permissions`

Maps roles to permissions (many-to-many).

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigserial | Primary key |
| `roleId` | bigint | Foreign key to roles.id |
| `permissionId` | bigint | Foreign key to permissions.id |
| `createdAt` | timestamp | Creation time |
| `updatedAt` | timestamp | Last update time |

**Constraints:**
- `UNIQUE(roleId, permissionId)`
- `ON DELETE CASCADE` for both foreign keys

---

### Table: `user_permissions`

User-specific permission overrides.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigserial | Primary key |
| `userId` | bigint | Foreign key to users.id |
| `permissionId` | bigint | Foreign key to permissions.id |
| `granted` | boolean | true = grant, false = revoke |
| `reason` | text | Reason for override |
| `expiresAt` | timestamp | Optional expiration time |
| `createdAt` | timestamp | Creation time |
| `updatedAt` | timestamp | Last update time |

**Constraints:**
- `UNIQUE(userId, permissionId)`
- `ON DELETE CASCADE` for both foreign keys

**Use cases:**
- Temporary admin access (with `expiresAt`)
- Revoke specific permission (even if role has it)

---

## Role-Based Access Control (RBAC)

The `@spfn/auth` package provides a flexible, extensible RBAC system that combines **code-defined system roles** with **runtime-created custom roles** and **granular permissions**.

### Built-in Roles

These roles are automatically created and cannot be deleted:

| Role | Priority | Built-in Permissions |
|------|----------|---------------------|
| `superadmin` | 100 | Full system access + RBAC management |
| `admin` | 80 | User management |
| `user` | 10 | Self auth management (default) |

### Built-in Permissions

Required permissions for auth package functionality:

- `auth:self:manage` - Change own password, rotate keys
- `user:read` - View user information
- `user:write` - Create and update users
- `user:delete` - Delete users
- `rbac:role:manage` - Create, update, delete roles
- `rbac:permission:manage` - Assign permissions

### Initialization

#### Minimal Setup (Built-in Only)

```typescript
import { initializeAuth } from '@spfn/auth/server';

// Only built-in roles: user, admin, superadmin
await initializeAuth();
```

#### With Presets

```typescript
await initializeAuth({
  usePresets: true,  // Adds: moderator, editor, viewer + content permissions
});
```

#### Custom Roles & Permissions

```typescript
await initializeAuth({
  roles: [
    {
      name: 'content-creator',
      displayName: 'Content Creator',
      priority: 20,
    },
    {
      name: 'subscriber',
      displayName: 'Subscriber',
      priority: 15,
    },
  ],
  permissions: [
    {
      name: 'post:create',
      displayName: 'Create Posts',
      category: 'content',
    },
    {
      name: 'post:publish',
      displayName: 'Publish Posts',
      category: 'content',
    },
    {
      name: 'video:upload',
      displayName: 'Upload Videos',
      category: 'media',
    },
  ],
  rolePermissions: {
    // Extend built-in admin role
    admin: ['post:create', 'post:publish', 'video:upload'],

    // Custom role permissions
    'content-creator': ['post:create', 'post:publish', 'video:upload'],
    subscriber: ['post:create'],
  },
});
```

### Permission Middleware

```typescript
import { authenticate, requirePermissions, requireRole } from '@spfn/auth/server';

// Require specific permission
app.bind(
  deleteUserContract,
  [authenticate, requirePermissions('user:delete')],
  async (c) => {
    // Only users with user:delete permission
  }
);

// Require multiple permissions (all)
app.bind(
  publishPostContract,
  [authenticate, requirePermissions('post:write', 'post:publish')],
  async (c) => {
    // Needs both permissions
  }
);

// Require role
app.bind(
  adminDashboardContract,
  [authenticate, requireRole('admin', 'superadmin')],
  async (c) => {
    // Only admin or superadmin
  }
);

// Require any of these permissions
import { requireAnyPermission } from '@spfn/auth/server';

app.bind(
  viewContentContract,
  [authenticate, requireAnyPermission('content:read', 'admin:access')],
  async (c) => {
    // Has either permission
  }
);
```

### Permission Checking in Code

```typescript
import { hasPermission, hasRole, getUserPermissions } from '@spfn/auth/server';

app.bind(createPostContract, [authenticate], async (c) => {
  const { userId } = getAuth(c);

  // Check single permission
  const canPublish = await hasPermission(userId, 'post:publish');

  // Check role
  const isAdmin = await hasRole(userId, 'admin');

  // Get all permissions
  const perms = await getUserPermissions(userId);

  // Conditional logic
  const post = await createPost({
    ...body,
    status: canPublish ? 'published' : 'draft',
  });

  return c.success(post);
});
```

### Runtime Role Management

```typescript
import { createRole, addPermissionToRole } from '@spfn/auth/server';

// Create custom role at runtime
const role = await createRole({
  name: 'moderator',
  displayName: 'Community Moderator',
  description: 'Manages community content',
  priority: 40,
  permissionIds: [1n, 2n, 3n],  // Permission IDs
});

// Add permission to role
await addPermissionToRole(role.id, 5n);

// Update role
await updateRole(role.id, {
  displayName: 'Senior Moderator',
  priority: 45,
});

// Delete role (system roles protected)
await deleteRole(role.id);
```

### Preset Roles & Permissions

Available presets (opt-in):

**Roles:**
- `moderator` (priority 50) - Content moderation
- `editor` (priority 30) - Content creation
- `viewer` (priority 5) - Read-only access

**Permissions:**
- `content:read`, `content:write`, `content:delete`, `content:publish`
- `comment:moderate`
- `system:config`
- `analytics:view`

Use individually:

```typescript
import { PRESET_ROLES, PRESET_PERMISSIONS } from '@spfn/auth/server';

await initializeAuth({
  presetRoles: ['MODERATOR', 'EDITOR'],
  presetPermissions: ['CONTENT_READ', 'CONTENT_WRITE', 'CONTENT_PUBLISH'],
  rolePermissions: {
    moderator: ['content:read', 'content:write', 'comment:moderate'],
    editor: ['content:read', 'content:write', 'content:publish'],
  },
});
```

### User-Specific Permissions

Grant or revoke permissions for individual users:

```typescript
import { userPermissions } from '@spfn/auth';
import { getDatabase } from '@spfn/core/db';

const db = getDatabase()!;

// Grant temporary permission
await db.insert(userPermissions).values({
  userId: 123n,
  permissionId: 5n,
  granted: true,
  reason: 'Temporary admin access for migration',
  expiresAt: new Date('2025-12-31'),
});

// Revoke permission (even if role has it)
await db.insert(userPermissions).values({
  userId: 456n,
  permissionId: 3n,
  granted: false,
  reason: 'Security violation',
});
```

### Account Status

| Status | Description | Login Allowed |
|--------|-------------|---------------|
| `active` | Normal operation | Yes |
| `inactive` | User deactivated account | No |
| `suspended` | Locked due to security/ToS violation | No |

---

## Security

### Key Management Best Practices

1. **Store Private Keys Securely**
   - Use `sessionStorage` for session-only keys
   - Use `localStorage` for persistent keys
   - Never send private keys to server
   - Never expose in logs or error messages

2. **Rotate Keys Before Expiry**
   - Keys expire after 90 days
   - Rotate keys when `daysRemaining <= 7`
   - Use `POST /_auth/keys/rotate` endpoint

```typescript
import { shouldRotateKey } from '@spfn/auth/client';

const createdAt = new Date(localStorage.getItem('auth.keyCreatedAt'));
const { shouldRotate, daysRemaining } = shouldRotateKey(createdAt, 90);

if (shouldRotate) {
  console.warn(`Key expires in ${daysRemaining} days - rotate soon!`);
  // Call rotation endpoint...
}
```

3. **Fingerprint Verification**
   - Always send fingerprint with public key
   - Server validates fingerprint = SHA-256(publicKey)
   - Prevents key tampering during transmission

4. **Token Expiry**
   - JWT tokens expire after 15 minutes by default
   - Use short expiry for sensitive operations
   - Generate new token for each request or cache for <15min

5. **Environment Variables**

```bash
# .env
JWT_SECRET=your-secret-key-change-in-production  # For legacy tokens
JWT_EXPIRES_IN=7d                                 # Token expiry
```

---

## Setup

### 1. Run Database Migrations

```bash
npx spfn db migrate
```

This creates the auth schema with 8 tables:

**Core Tables:**
- `users` - User accounts and profiles
- `user_public_keys` - Client public keys for JWT
- `verification_codes` - OTP verification codes
- `user_social_accounts` - OAuth provider accounts

**RBAC Tables:**
- `roles` - System and custom roles
- `permissions` - System and custom permissions
- `role_permissions` - Role-permission mappings
- `user_permissions` - User-specific permission overrides

### 2. Configure Environment Variables

```bash
# .env
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=7d
```

### 3. Create Initial Admin Accounts (Optional)

You can automatically create admin accounts on server startup using environment variables. Three formats are supported:

#### Option 1: JSON Format (Most Flexible)

Allows full control over each account's configuration.

```bash
# .env
ADMIN_ACCOUNTS='[
  {
    "email": "super@example.com",
    "password": "super-password",
    "role": "superadmin",
    "phone": "+821012345678",
    "passwordChangeRequired": true
  },
  {
    "email": "admin@example.com",
    "password": "admin-password",
    "role": "admin"
  },
  {
    "email": "user@example.com",
    "password": "user-password",
    "role": "user",
    "passwordChangeRequired": false
  }
]'
```

**JSON Fields:**
- `email` (required): Email address
- `password` (required): Initial password
- `role` (optional): `superadmin`, `admin`, or `user` (default: `user`)
- `phone` (optional): Phone number in E.164 format
- `passwordChangeRequired` (optional): Force password change on first login (default: `true`)

---

#### Option 2: Comma-Separated Format (Simple)

Quick setup for multiple accounts with basic configuration.

```bash
# .env
ADMIN_EMAILS=super@example.com,admin@example.com,user@example.com
ADMIN_PASSWORDS=super-pass,admin-pass,user-pass
ADMIN_ROLES=superadmin,admin,user  # Optional, defaults to 'user'
```

**Requirements:**
- `ADMIN_EMAILS` and `ADMIN_PASSWORDS` must have the same number of items
- `ADMIN_ROLES` is optional (defaults to `user` for each account)
- All accounts will have `passwordChangeRequired: true`

---

#### Option 3: Single Account (Legacy)

For backward compatibility, you can create a single superadmin account.

```bash
# .env
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=secure-password
```

This creates a single account with:
- `role: 'superadmin'`
- `passwordChangeRequired: true`

---

#### Usage in Server Code

Call `ensureAdminExists()` in your server startup code:

```typescript
// src/server/index.ts or app initialization
import { ensureAdminExists } from '@spfn/auth/server';

// Call during server startup
await ensureAdminExists();
```

**Output Example:**
```
[Auth] Creating 3 admin account(s)...
[Auth] ✅ Admin account created: super@example.com (superadmin)
[Auth] ✅ Admin account created: admin@example.com (admin)
[Auth] ⚠️  Account already exists: user@example.com (skipped)
[Auth] 📊 Summary: 2 created, 1 skipped, 0 failed
[Auth] ⚠️  Please change passwords on first login!
```

**Behavior:**
- Accounts are only created if they don't already exist
- All created accounts are auto-verified (`emailVerifiedAt` is set)
- By default, password change is required on first login
- If no environment variables are set, the function silently returns

---

### 4. Import in Your SPFN Project

```typescript
// Server-side only
import { authenticate, getAuth, getUser } from '@spfn/auth/server';
import { users, userPublicKeys } from '@spfn/auth'; // Entities

// Client-side only
import { generateKeyPair, generateClientToken } from '@spfn/auth/client';

// Common (both sides)
import type { User, UserRole, UserStatus } from '@spfn/auth';
```

---

## Testing

### Run All Tests

```bash
pnpm test
```

### Run Tests with Coverage

```bash
pnpm test:coverage
```

Current coverage: **83.01%** (25 tests passing)

### Run Route Tests Only

```bash
pnpm test:routes
```

### Start Test Database

```bash
pnpm docker:test:up
```

### Stop Test Database

```bash
pnpm docker:test:down
```

---

## Package Structure

```
@spfn/auth/
├── dist/
│   ├── index.js          # Common exports (types, entities)
│   ├── server.js         # Server-only exports (routes, middleware, helpers, services)
│   └── client.js         # Client-only exports (crypto, hooks, store)
├── migrations/           # Drizzle database migrations
└── src/
    ├── index.ts          # Common entry point
    ├── server.ts         # Server entry point
    ├── client.ts         # Client entry point
    ├── lib/              # Shared code
    │   ├── api/          # API client functions
    │   ├── contracts/    # Type-safe API contracts
    │   └── types/        # Shared TypeScript types
    ├── server/           # Server-only code
    │   ├── entities/     # Drizzle ORM entities
    │   ├── services/     # 🆕 Business logic layer (reusable functions)
    │   │   ├── auth.service.ts
    │   │   ├── verification.service.ts
    │   │   ├── key.service.ts
    │   │   ├── user.service.ts
    │   │   └── index.ts
    │   ├── routes/       # API route handlers (thin layer calling services)
    │   ├── middleware/   # Authentication middleware
    │   ├── helpers/      # JWT, password, verification utils
    │   └── repositories/ # Database access layer
    └── client/           # Client-only code
        ├── lib/          # Crypto helpers (key generation, JWT signing)
        ├── hooks/        # React hooks (TODO)
        ├── store/        # Zustand state management (TODO)
        └── components/   # React components (TODO)
```

---

## SPFN Framework Integration

This package automatically integrates with SPFN via `package.json`:

```json
{
  "spfn": {
    "prefix": "/_auth",
    "schemas": ["./dist/server/entities/*.js"],
    "routes": {
      "basePath": "/auth",
      "dir": "./dist/server/routes"
    },
    "migrations": {
      "dir": "./migrations"
    }
  }
}
```

Routes are automatically registered:
- `/_auth/codes` → Send verification code
- `/_auth/codes/verify` → Verify code
- `/_auth/exists` → Check account existence
- `/_auth/register` → Register user
- `/_auth/login` → Login
- `/_auth/logout` → Logout (authenticated)
- `/_auth/keys/rotate` → Rotate key (authenticated)
- `/_auth/password` → Change password (authenticated)

---

## Development Status

**Version:** 0.1.0-alpha.0 (Alpha)

**Completed:**
- Asymmetric JWT authentication (ES256/RS256)
- User registration and login
- OTP verification flow (email/SMS)
- Session management with key rotation
- Password change functionality
- RBAC roles and account status
- Comprehensive test coverage (83%)

**In Progress:**
- Client-side React hooks (useAuth, useSession)
- Client-side Zustand store
- React UI components (LoginForm, RegisterForm)

**Roadmap:**
- OAuth provider integration (Google, GitHub)
- Two-factor authentication (2FA)
- Password reset flow
- Email change flow
- Phone change flow
- Admin management APIs

---

## Contributing

This is an internal SPFN package. Please follow the monorepo conventions when contributing.

---

## License

MIT