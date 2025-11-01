---
title: "Ecosystem"
description: "Build and share reusable modules for the SPFN framework"
order: 1
available: true
---

# SPFN Ecosystem

Build and share reusable modules for the SPFN framework.

## Overview

The SPFN ecosystem allows you to create modular, reusable packages that can be:
- Shared across your organization's projects
- Published to npm for the community
- Composed together to build full-stack applications

## Documentation

### Getting Started

- **[Creating Modules](./creating-modules.md)** - Learn how to create your first SPFN module

### Module Development

- **Module Architecture** - Understanding the 3-layer architecture
- **Advanced Patterns** - Complex module scenarios and best practices
- **Testing Modules** - Comprehensive testing strategies

### Distribution

- **Publishing Modules** - Share your modules with others
- **Contributing** - Guidelines for contributing to official modules

## Official Modules

### @spfn/auth
Authentication and user management module with JWT, sessions, and protected routes.

```bash
spfn add @spfn/auth
```

### @spfn/cms
Full-featured content management system with multi-language support and version control.

```bash
spfn add @spfn/cms
```

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

- [Core Concepts](../core-concepts/) - Understanding SPFN fundamentals
- [Guides](../guides/) - Step-by-step tutorials
- [API Reference](../api-reference/) - Complete API documentation