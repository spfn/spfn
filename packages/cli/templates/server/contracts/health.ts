import { Type } from '@sinclair/typebox';

/**
 * Health Check Contract
 *
 * Public endpoint (skips auth middleware)
 */
export const healthContract = {
    method: 'GET' as const,
    path: '/',
    response: Type.Object({
        status: Type.Literal('ok'),
        timestamp: Type.Number(),
        uptime: Type.Number()
    }),
    meta: {
        public: true,
        tags: ['health'],
        description: 'Health check endpoint'
    }
};