# @spfn/auth

Authentication, authorization, and RBAC module for SPFN.

## Features

- User management
- Authentication (login, logout, register)
- Session management
- Role-Based Access Control (RBAC)
- JWT token generation and verification
- Password hashing with bcrypt
- Type-safe API contracts

## Installation

```bash
pnpm add @spfn/auth
```

## Usage

```typescript
// In your SPFN project
import { ... } from '@spfn/auth';
import { ... } from '@spfn/auth/server';
import { ... } from '@spfn/auth/middleware';
```

## Setup

1. Run migrations to create auth tables:
```bash
npx spfn db migrate
```

2. Configure environment variables:
```bash
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
```

## Development Status

This package is currently in alpha. APIs may change.

## License

MIT