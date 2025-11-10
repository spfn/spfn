/**
 * Standard API Response Types & Schemas
 *
 * Pure TypeBox schemas and type definitions for API responses.
 * Can be used in both server and client code.
 */

import type { TSchema } from '@sinclair/typebox';
import { Type } from '@sinclair/typebox';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Standard error response format
 *
 * Used by ErrorHandler middleware for all error responses.
 * Compatible with ApiResponse pattern for consistent API responses.
 */
export interface ErrorResponse
{
    success: false;
    error: {
        message: string;
        type: string;
        statusCode: number;
        stack?: string;
        details?: any;
    };
}

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
 * Error response type (alias for ErrorResponse)
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
 * Creates a TypeBox schema for ApiSuccessResponse<T>
 *
 * Use this in your route contract's response field for standardized responses.
 * Note: ContractClient throws ApiClientError on failure, so only success type is needed.
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
    return ApiSuccessSchema(dataSchema);
}
