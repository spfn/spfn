import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Config for @spfn/workflow package
 *
 * This generates migrations for the workflow schema that will be
 * bundled with the package and applied automatically when
 * users run `spfn db push` or `spfn db migrate`
 */
export default defineConfig({
    schema: './src/entities/index.ts',
    out: './migrations',
    dialect: 'postgresql',
    schemaFilter: ['spfn_workflow'], // Only generate for workflow schema
});
