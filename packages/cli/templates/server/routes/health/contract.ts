import { Type } from '@sinclair/typebox';

/**
 * Health Check Contract
 */
export const healthContract = {
    method: 'GET' as const,
    path: '/',
    response: Type.Object({
        status: Type.String(),
        timestamp: Type.Number()
    })
};