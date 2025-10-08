import { Type } from '@sinclair/typebox';

/**
 * Root Contract
 */
export const rootContract = {
    method: 'GET' as const,
    path: '/',
    response: Type.Object({
        message: Type.String(),
        version: Type.String()
    })
};