/**
 * Ops routes — operate this application from the terminal.
 *
 * Operations are written exactly like features: `opsRoute` puts them under the
 * `/_ops` namespace, and `createOpsRouter` injects `opsTokenAuth` into every one
 * of them plus serves `GET /_ops/_manifest`, which the `spfn ops` CLI reads to
 * discover the commands this app owns.
 *
 * First run, against a running server:
 *
 *   spfn ops token issue --name laptop --scopes 'example:read'
 *   spfn ops list --app http://localhost:8790
 *   spfn ops call countExamples --app http://localhost:8790
 *
 * Issuing a token signs in as an administrator, so seed one first with
 * `SPFN_AUTH_ADMIN_ACCOUNTS` in `.env.server`.
 */
import { createOpsRouter, opsRoute } from '@spfn/core/ops';
import { opsTokenAuth, requireOpsScope } from '@spfn/auth/server';
import { Type } from '@sinclair/typebox';
import { ExampleRepository } from '../repositories/example.repository';

const exampleRepo = new ExampleRepository();

/**
 * GET /_ops/examples/count — how many examples exist
 */
const countExamples = opsRoute.get('/examples/count')
    .use([requireOpsScope('example:read')])
    .handler(async () => ({ count: await exampleRepo.countAll() }));

/**
 * GET /_ops/examples — recent examples, ops view
 */
const listRecentExamples = opsRoute.get('/examples')
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
