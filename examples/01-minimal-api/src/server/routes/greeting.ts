/**
 * Greeting Route: GET /greeting
 *
 * The smallest possible SPFN route — a typed input, a typed return, no database.
 * `route.get(path).input({...}).handler(...)` is the whole pattern.
 */

import { route } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';

export const getGreeting = route.get('/greeting')
    .input({
        query: Type.Object({
            name: Type.Optional(Type.String({ description: 'Who to greet' })),
        }),
    })
    .handler(async (c) =>
    {
        const { query } = await c.data();
        const name = query.name ?? 'World';

        return {
            message: `Hello, ${name}!`,
            framework: 'SPFN',
        };
    });
