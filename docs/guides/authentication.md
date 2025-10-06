# Authentication Guide

This guide covers how to use the SPFN authentication system.

## Overview

SPFN provides a secure client-key based authentication system via `@spfn/auth`.

## Quick Start

```bash
npm install @spfn/auth
```

```typescript
import { ClientKeyAuth } from '@spfn/auth';

// Initialize authentication
const auth = new ClientKeyAuth({
  tableName: 'user_keys',
  cacheConfig: {
    memory: true,
    redis: true,
    ttl: 3600
  }
});

// Use as middleware
app.use('/api/*', auth.middleware());
```

## Features

- **ECDSA P-256** asymmetric cryptography
- **3-tier caching** (Memory → Redis → Database)
- **Replay attack prevention** with nonce + timestamp
- **Secure key storage** using AES-256-GCM encryption

## Documentation

- [API Reference](../api/auth.md)
- [Architecture Details](../advanced/auth-architecture.md)
- [Security Best Practices](../advanced/auth-security.md)
- [Package README](../../packages/auth/README.md)

## Installation

See the [@spfn/auth package documentation](../../packages/auth/README.md) for detailed installation and usage instructions.