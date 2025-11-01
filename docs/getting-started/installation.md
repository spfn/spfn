---
title: "Installation"
description: "Install SPFN and set up your development environment"
order: 2
available: true
---

Get started with SPFN by creating a new project or adding it to an existing Next.js application.

## System Requirements

- Node.js 18.0 or later
- Next.js 15.0 or later (App Router)
- TypeScript 5.3 or later
- PostgreSQL (or Docker)

## Automatic Installation

The easiest way to get started is using the SPFN CLI:

```bash
npx spfn@alpha create my-app
cd my-app
```

This creates a new SPFN project with Next.js, TypeScript, and all necessary dependencies pre-configured.

## Manual Installation

To add SPFN to an existing Next.js project:

```bash
npm install spfn @spfn/core
# or
pnpm add spfn @spfn/core
# or
yarn add spfn @spfn/core
```

## Database Setup

SPFN requires PostgreSQL. You can use Docker for development:

```bash
# Using the included docker-compose.yml
docker compose up -d
```

Or configure your own PostgreSQL connection in `.env`.

## Start Development Server

```bash
npm run spfn:dev
```

This starts two servers:

- **Backend:** `http://localhost:8790`
- **Frontend:** `http://localhost:3790`

> **✅ Success:** Now that you have SPFN installed, learn about the project structure.
>
> [Project Structure →](/docs/getting-started/project-structure)