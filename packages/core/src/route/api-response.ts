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
 * Error cause information
 *
 * Represents a single error in the error cause chain.
 * Includes database-specific error information (PostgreSQL).
 */
export interface ErrorCause
{
    message: string;
    name?: string;
    code?: string;
    detail?: string;
    hint?: string;
    constraint?: string;
    table?: string;
    column?: string;
    schema?: string;
    stack?: string;
}

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
        timestamp: string;
        stack?: string;
        causes?: ErrorCause[];
        details?: Record<string, unknown>;
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
// Type Guards
// ============================================================================

/**
 * Type guard for ErrorResponse
 *
 * Validates at runtime whether a value conforms to ErrorResponse structure.
 * Useful for safely handling API responses and proxy errors.
 *
 * @param value - Value to check
 * @returns true if value is ErrorResponse
 *
 * @example
 * ```typescript
 * const response = await fetch('/api/users');
 * const data = await response.json();
 *
 * if (isErrorResponse(data)) {
 *   console.error('Error:', data.error.message);
 *   console.log('Status:', data.error.statusCode);
 *   console.log('Timestamp:', data.error.timestamp);
 * }
 * ```
 */
export function isErrorResponse(value: unknown): value is ErrorResponse
{
    return (
        typeof value === 'object' &&
        value !== null &&
        'success' in value &&
        value.success === false &&
        'error' in value &&
        typeof (value as any).error === 'object' &&
        'message' in (value as any).error &&
        'type' in (value as any).error &&
        'statusCode' in (value as any).error &&
        'timestamp' in (value as any).error
    );
}

/**
 * Type guard for ApiSuccessResponse
 *
 * Validates at runtime whether a value conforms to ApiSuccessResponse structure.
 *
 * @param value - Value to check
 * @returns true if value is ApiSuccessResponse
 *
 * @example
 * ```typescript
 * const response = await fetch('/api/users');
 * const data = await response.json();
 *
 * if (isSuccessResponse(data)) {
 *   console.log('Users:', data.data);
 *   if (data.meta?.pagination) {
 *     console.log('Page:', data.meta.pagination.page);
 *   }
 * }
 * ```
 */
export function isSuccessResponse<T = any>(value: unknown): value is ApiSuccessResponse<T>
{
    return (
        typeof value === 'object' &&
        value !== null &&
        'success' in value &&
        value.success === true &&
        'data' in value
    );
}

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
 * Creates a TypeBox schema for ErrorCause
 */
export function ErrorCauseSchema()
{
    return Type.Object({
        message: Type.String(),
        name: Type.Optional(Type.String()),
        code: Type.Optional(Type.String()),
        detail: Type.Optional(Type.String()),
        hint: Type.Optional(Type.String()),
        constraint: Type.Optional(Type.String()),
        table: Type.Optional(Type.String()),
        column: Type.Optional(Type.String()),
        schema: Type.Optional(Type.String()),
        stack: Type.Optional(Type.String()),
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
            timestamp: Type.String(),
            stack: Type.Optional(Type.String()),
            causes: Type.Optional(Type.Array(ErrorCauseSchema())),
            details: Type.Optional(Type.Unknown()),
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
