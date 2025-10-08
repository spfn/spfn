import { Type } from '@sinclair/typebox';

/**
 * Root endpoint contract
 */
export const rootContract = {
    method: 'GET' as const,
    path: '/',
    response: Type.Object({
        name: Type.String(),
        version: Type.String(),
        status: Type.String(),
        endpoints: Type.Object({
            health: Type.String(),
            examples: Type.String(),
        }),
        message: Type.String(),
    }),
    meta: {
        public: true,
        tags: ['system'],
        description: 'API root endpoint',
    },
};