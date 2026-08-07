/**
 * Ops Routes: the CLI-first operations surface
 *
 * Operations are developed exactly like features — as routes — and mounted
 * through createOpsRouter, which enforces the /_ops/ prefix, injects
 * opsTokenAuth into every route, and serves GET /_ops/_manifest for the
 * `spfn ops` CLI to discover commands from.
 *
 * Try it against a running server:
 *
 *   spfn ops token issue --name demo --scopes 'example:read'
 *   spfn ops list --app http://localhost:8790 --token <token>
 *   spfn ops call countExamples --app http://localhost:8790 --token <token>
 */

import { route } from '@spfn/core/route';
import { createOpsRouter } from '@spfn/core/ops';
import { opsTokenAuth, requireOpsScope } from '@spfn/auth/server';
import { Type } from '@sinclair/typebox';
import { ExampleRepository } from '../repositories/example.repository';

const exampleRepo = new ExampleRepository();

/**
 * GET /_ops/examples/count - how many examples exist
 */
const countExamples = route.get('/_ops/examples/count')
    .use([requireOpsScope('example:read')])
    .handler(async () =>
    {
        const examples = await exampleRepo.findAll(100, 0);

        return { count: examples.length };
    });

/**
 * GET /_ops/examples - recent examples, ops view
 */
const listRecentExamples = route.get('/_ops/examples')
    .use([requireOpsScope('example:read')])
    .input({
        query: Type.Object({
            limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
        }),
    })
    .handler(async (c) =>
    {
        const { query } = await c.data();

        return { items: await exampleRepo.findAll(query.limit ?? 10, 0) };
    });

export const opsRouter = createOpsRouter({
    countExamples,
    listRecentExamples,
}, { auth: opsTokenAuth });
