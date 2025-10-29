import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';

/**
 * Root API Contract
 */
export const rootContract = {
    method: 'GET' as const,
    path: '/',  // ← Root path
    response: Type.Object({
        name: Type.String(),
        version: Type.String(),
        status: Type.String(),
        endpoints: Type.Object({
            health: Type.String(),
            examples: Type.String(),
        }),
        message: Type.String(),
    })
} as const satisfies RouteContract;