import { Type } from '@sinclair/typebox';
import { type RouteContract, ApiResponseSchema } from '@spfn/core/route/types';

/**
 * Root API Contract
 */
export const rootContract = {
    method: 'GET' as const,
    path: '/',  // ← Root path
    response: ApiResponseSchema(
        Type.Object({
            name: Type.String(),
            version: Type.String(),
            status: Type.String(),
            endpoints: Type.Object({
                health: Type.String(),
                examples: Type.String(),
            }),
            message: Type.String(),
        })
    )
} as const satisfies RouteContract;