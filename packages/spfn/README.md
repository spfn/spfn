# spfn

> Superfunction CLI - The Backend Layer for Next.js

This is a thin wrapper package that provides a shorter name for the `@spfn/cli` package.

## Usage

```bash
# Using npx (no installation required)
npx spfn@latest init

# Or install globally
npm install -g spfn
spfn init
```

This package simply forwards all commands to `@spfn/cli`. See the [@spfn/cli documentation](../cli/README.md) for full details.

## Why this package exists

To provide a better developer experience with a shorter package name:

- ✅ `npx spfn@latest init`
- ❌ `npx @spfn/cli@latest init`

Similar to how other popular tools work (e.g., `npx shadcn@latest init`).