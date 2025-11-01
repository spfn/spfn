---
title: "Contracts"
description: "Learn how to define type-safe API contracts with TypeBox"
order: 1
available: true
---

# Contracts

Contracts are the foundation of SPFN's type safety. They define your API shape using TypeBox schemas.

## What is a Contract?

A contract is a TypeScript object that describes an API endpoint:

- HTTP method (GET, POST, PUT, DELETE, etc.)
- URL path with optional parameters
- Request body, query, and header schemas
- Response schema

## Basic Contract

```typescript
import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core';

export const getUserContract = {
  method: 'GET',
  path: '/users/:id',
  params: Type.Object({
    id: Type.String()
  }),
  response: Type.Object({
    id: Type.String(),
    name: Type.String(),
    email: Type.String()
  })
} satisfies RouteContract;
```

## Full Contract Example

Contracts can include body, query parameters, and more:

```typescript
export const createPostContract = {
  method: 'POST',
  path: '/posts',

  // Request body schema
  body: Type.Object({
    title: Type.String({ minLength: 1, maxLength: 200 }),
    content: Type.String(),
    tags: Type.Optional(Type.Array(Type.String()))
  }),

  // Query parameters
  query: Type.Object({
    draft: Type.Optional(Type.Boolean())
  }),

  // Response schema
  response: Type.Object({
    id: Type.String(),
    title: Type.String(),
    content: Type.String(),
    tags: Type.Array(Type.String()),
    createdAt: Type.String()
  })
} satisfies RouteContract;
```

## TypeBox Schemas

SPFN uses TypeBox for schema definitions. Common types:

- `Type.String()` - String with optional constraints (minLength, maxLength, format)
- `Type.Number()` - Numeric values (integer, minimum, maximum)
- `Type.Boolean()` - Boolean values
- `Type.Array(T)` - Array of type T
- `Type.Object()` - Object with typed properties
- `Type.Optional(T)` - Make a field optional
- `Type.Union([T1, T2])` - Union types

## Why TypeBox?

SPFN uses TypeBox for schema validation instead of alternatives like Zod or Yup:

- **JSON Schema Standard** - Universal format for OpenAPI, tooling, and cross-language support
- **Performance** - 10x faster than Zod, 20x faster than Yup
- **Type Inference** - Full TypeScript type inference from schemas
- **Single Source of Truth** - One schema for runtime validation, TypeScript types, and API docs

> **Note:** For detailed performance benchmarks and technical comparisons, see [Architecture: Why TypeBox?](/docs/architecture/why-typebox)

## Contract Organization

Organize contracts by domain or feature:

```bash
src/contracts/
├── users.ts        # User-related contracts
├── posts.ts        # Post-related contracts
├── auth.ts         # Authentication contracts
└── common.ts       # Shared schemas
```

> **Next:** Learn how to bind contracts to route handlers in your backend. [Route Binding →](/docs/core-concepts/route-binding)
