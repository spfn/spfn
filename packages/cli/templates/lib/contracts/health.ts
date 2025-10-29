import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';

/**
 * Health Check Contract
 */
export const healthContract = {
    method: 'GET' as const,
    path: '/health',  // ← Absolute path
    response: Type.Object({
        status: Type.String(),
        timestamp: Type.String()
    })
} as const satisfies RouteContract;