/**
 * Standard API Response Types & Helpers
 *
 * Optional utilities for consistent API responses across your application.
 * Use these in your route contracts for standardized success/error responses.
 */

import type { TSchema } from '@sinclair/typebox';
import { Type } from '@sinclair/typebox';
import type { ErrorResponse } from '../middleware';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Success response wrapper
 */
export interface ApiSuccessResponse<T = any>
{
    success: true;
    data: T;
    meta?: {
        timestamp?: string;
        requestId?: string;
        pagination?: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
        [key: string]: any;
    };
}

/**
 * Error response type (re-exported from ErrorHandler for consistency)
 */
export type ApiErrorResponse = ErrorResponse;

/**
 * Unified API response type
 */
export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

// ============================================================================
// TypeBox Schema Helpers
// ============================================================================

/**
 * Creates a TypeBox schema for ApiSuccessResponse<T>
 *
 * @example
 * ```ts
 * const UserSchema = Type.Object({
 *   id: Type.String(),
 *   name: Type.String(),
 * });
 *
 * const contract = {
 *   response: ApiSuccessSchema(UserSchema),
 * };
 * ```
 */
export function ApiSuccessSchema<T extends TSchema>(dataSchema: T)
{
    return Type.Object({
        success: Type.Literal(true),
        data: dataSchema,
        meta: Type.Optional(Type.Object({
            timestamp: Type.Optional(Type.String()),
            requestId: Type.Optional(Type.String()),
            pagination: Type.Optional(Type.Object({
                page: Type.Number(),
                limit: Type.Number(),
                total: Type.Number(),
                totalPages: Type.Number(),
            })),
        })),
    });
}

/**
 * Creates a TypeBox schema for ApiErrorResponse
 */
export function ApiErrorSchema()
{
    return Type.Object({
        success: Type.Literal(false),
        error: Type.Object({
            message: Type.String(),
            type: Type.String(),
            statusCode: Type.Number(),
            stack: Type.Optional(Type.String()),
            details: Type.Optional(Type.Any()),
        }),
    });
}

/**
 * Creates a TypeBox union schema for ApiResponse<T>
 *
 * Use this in your route contract's response field for standardized responses.
 *
 * @example
 * ```ts
 * const contract = {
 *   method: 'GET',
 *   path: '/users/:id',
 *   response: ApiResponseSchema(Type.Object({
 *     id: Type.String(),
 *     name: Type.String(),
 *   })),
 * };
 * ```
 */
export function ApiResponseSchema<T extends TSchema>(dataSchema: T)
{
    return Type.Union([
        ApiSuccessSchema(dataSchema),
        ApiErrorSchema(),
    ]);
}
