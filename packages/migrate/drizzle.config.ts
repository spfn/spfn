import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Config for @spfn/migrate package
 *
 * This generates migrations for the migrate ledger schema that will be
 * bundled with the package and applied automatically when
 * users run `spfn db push` or `spfn db migrate`
 */
export default defineConfig({
    schema: './src/server/entities/index.ts',
    out: './migrations',
    dialect: 'postgresql',
    schemaFilter: ['spfn_migrate'], // Only generate for migrate schema
});
