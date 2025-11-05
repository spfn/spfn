---
title: "Introduction"
description: "Build and share reusable modules for Superfunction"
order: 1
available: true
---

# Superfunction Ecosystem

Build and share reusable Superfunction modules.

## Overview

The Superfunction ecosystem allows you to create modular, reusable packages that can be:
- Shared across your organization's projects
- Published to npm for the community
- Composed together to build full-stack applications

## Documentation

### Getting Started

- **[Creating Modules](./creating-modules.md)** - Learn how to create your first Superfunction module

### Module Development

- **Module Architecture** - Understanding the 3-layer architecture
- **Advanced Patterns** - Complex module scenarios and best practices
- **Testing Modules** - Comprehensive testing strategies

### Distribution

- **Publishing Modules** - Share your modules with others
- **Contributing** - Guidelines for contributing to official modules

## Official Modules

### @spfn/auth
Enterprise-grade authentication and authorization with asymmetric JWT, RBAC, and comprehensive security features.

```bash
spfn add @spfn/auth
```

**Features:**
- ✅ Asymmetric JWT (ES256/RS256) - Client-signed tokens, no shared secrets
- ✅ Multi-factor authentication - 6-digit OTP via email/SMS
- ✅ Role-Based Access Control - Built-in roles (superadmin, admin, user) + custom roles
- ✅ Session management - 90-day key expiry, automatic rotation
- ✅ User-specific permissions - Grant/revoke with expiration support
- ✅ 226 tests, 85%+ coverage

**[📖 README](../packages/auth/README.md)** | [npm](https://www.npmjs.com/package/@spfn/auth)

### @spfn/cms
Full-featured content management system with JSON-based labels, 50+ languages, and version control.

```bash
spfn add @spfn/cms
```

**[📖 Documentation](./cms/index.md)** | [Getting Started](./cms/getting-started.md) | [API Reference](./cms/api-reference.md)

## Community Modules

Discover community-created modules at [spfn.dev/modules](https://spfn.dev/modules).

## Quick Start

Generate a new module:

```bash
npx spfn generate
```

Follow the prompts to configure your module with:
- Custom npm scope (`@mycompany`, `@username`)
- Module name and description
- Initial entities and routes

## Key Features

- ✅ **Type-safe APIs** - Full TypeScript support with auto-generated clients
- ✅ **Database isolation** - Each module has its own schema
- ✅ **Zero config** - Automatic code generation and builds
- ✅ **React ready** - Hooks and components included
- ✅ **Testing built-in** - Vitest integration out of the box

## Learn More

- [Core Concepts](../core-concepts/) - Understanding Superfunction fundamentals
- [Guides](../guides/) - Step-by-step tutorials
- [API Reference](../api-reference/) - Complete API documentation