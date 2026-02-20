import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Config for @spfn/notification package
 *
 * This generates migrations for the notification schema that will be
 * bundled with the package and applied automatically when
 * users run `spfn db push` or `spfn db migrate`
 */
export default defineConfig({
    schema: './src/entities/index.ts',
    out: './migrations',
    dialect: 'postgresql',
    schemaFilter: ['spfn_notification'], // Only generate for notification schema
});
