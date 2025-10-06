/**
 * Example Route: GET /examples
 *
 * File naming patterns:
 * - routes/index.ts -> / (root route)
 * - routes/users/index.ts -> /users (all HTTP methods in one file)
 * - routes/users/[id].ts -> /users/:id (dynamic parameter)
 * - routes/posts/[...slug].ts -> /posts/* (catch-all route)
 *
 * Export named functions for each HTTP method: GET, POST, PUT, PATCH, DELETE
 */

import type { RouteContext } from '@spfn/core';

export const meta =
{
    description: 'Example route showing SPFN framework features',
    tags: ['examples'],
};

export async function GET(c: RouteContext)
{
    return c.json(
    {
        message: 'Welcome to SPFN!',
        framework: '@spfn/core',
        features:
        {
            routing: 'File-based routing (Next.js style)',
            transactions: 'Automatic transaction management',
            repository: 'Type-safe Repository pattern',
            typeGen: 'Auto-generated API types',
        },
        quickStart:
        {
            step1: 'Define entities in src/server/entities/',
            step2: 'Create routes in src/server/routes/',
            step3: 'Run npm run generate to create types',
            step4: 'Use generated API client in frontend',
        },
        learnMore: 'https://spfn.dev/docs',
    });
}