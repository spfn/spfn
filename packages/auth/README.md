# @spfn/auth

![Coverage](https://img.shields.io/badge/coverage-83.01%25-green)
![Tests](https://img.shields.io/badge/tests-25%20passed-brightgreen)

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

## Testing

Run tests with coverage:

```bash
pnpm test:coverage
```

Run tests in watch mode:

```bash
pnpm test
```

Start test database:

```bash
pnpm docker:test:up
```

## Development Status

This package is currently in alpha. APIs may change.

## License

MIT