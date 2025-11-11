import { Type } from '@sinclair/typebox';
import { type RouteContract, ApiResponseSchema } from '@spfn/core/route/types';

/**
 * Health Check Contract
 */
export const healthContract = {
    method: 'GET' as const,
    path: '/health',  // ← Absolute path
    response: ApiResponseSchema(
        Type.Object({
            status: Type.String(),
            timestamp: Type.String()
        })
    )
} as const satisfies RouteContract;