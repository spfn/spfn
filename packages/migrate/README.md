# @spfn/migrate

> **Change the data, not the schema — exactly once**

Adding a column is a schema change and Drizzle handles it. Filling that column for the
rows that already exist is a different problem: it is TypeScript, it may take minutes, and
it must not run twice. Doing it by hand against production is how a backfill gets applied
three times.

`@spfn/migrate` runs those data transformations — backfills, state transitions, derived
calculations — and keeps a ledger of what has already run, so a redeploy skips them.

| | Handled by |
|---|---|
| Add a table or column | Drizzle SQL migrations (`spfn db generate` / `migrate`) |
| Fill, reshape or move the rows inside it | this package |

## Installation

```bash
pnpm add @spfn/migrate @spfn/core drizzle-orm
```

## Setup

`@spfn/migrate` uses a `data_migrations` table to track which migrations have been applied. This table must be created via your application's schema pipeline.

### 1. Register the Schema

Include the `dataMigrations` entity in your project's schema definition (e.g., `src/server/db/schema.ts`).

```typescript
import { dataMigrations } from '@spfn/migrate';

export const schema = {
  // ... your other tables
  dataMigrations,
};
```

### 2. Create the Table

Depending on your environment, apply the schema change:

- **Local Development**: Run `pnpm spfn db push` to synchronize the schema immediately.
- **Production**: Generate a SQL migration using `drizzle-kit generate` and execute it as part of your deployment pipeline.

> **Important**: The `data_migrations` table must exist before calling `migrator.apply()`, otherwise a database error will occur.

## Usage

### 1. Define Migrations

Create your migrations in separate files. Use a timestamp prefix for the name to avoid merge conflicts.

```typescript
// src/server/migrations/20260701_backfill_user_ranks.ts
import { defineDataMigration } from '@spfn/migrate';

export default defineDataMigration({
    name: '20260701_backfill_user_ranks',
    async up({ db, log }) {
        // Your data transformation logic here
        log.info('Backfilling user ranks...');
        // ...
    },
});
```

### 2. Create and Run the Migrator

Register your migrations and run the migrator during server startup.

```typescript
import { createDataMigrator } from '@spfn/migrate';
import m1 from './migrations/20260701_backfill_user_ranks';

const migrator = createDataMigrator([m1]);

async function bootstrap() {
    const result = await migrator.apply();
    console.log(`Applied ${result.applied.length} migrations.`);
}
```

## API

### `defineDataMigration`
A helper to define a data migration.

- `name`: Unique identifier (recommended: `YYYYMMDD_slug`).
- `up`: The logic to apply the migration.
- `transaction`: (Optional) Whether to wrap the migration and the ledger record in a single transaction. Default is `true`. 
  - Set to `false` for huge tables to avoid long-held locks. 
  - **Warning**: If `false`, your `up` logic must be **idempotent**.

### `createDataMigrator`
Creates a migrator instance to manage the lifecycle of migrations.

- `apply()`: Applies all pending migrations in alphabetical order.
- `check()`: Returns pending migrations without applying them.
- `status()`: Returns the list of applied and pending migrations.
- `baseline()`: Marks all registered migrations as applied without executing them.
