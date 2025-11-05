import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';
import { ApiResponseSchema } from '@spfn/core/route';

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