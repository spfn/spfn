import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Config for @spfn/cms package
 *
 * This generates migrations for the CMS schema that will be
 * bundled with the package and applied automatically when
 * users run `spfn db push` or `spfn db migrate`
 */
export default defineConfig({
    schema: './src/entities/*.ts',
    out: './migrations',
    dialect: 'postgresql',
    schemaFilter: ['spfn_cms'], // Only generate for CMS schema
});
