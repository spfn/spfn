/**
 * Standard API Response Types & Helpers
 *
 * Optional utilities for consistent API responses across your application.
 * Use these in your route contracts for standardized success/error responses.
 *
 * @example
 * ```ts
 * import { ApiResponseSchema, success, error, paginated } from '@spfn/core/route';
 * import { Type } from '@sinclair/typebox';
 *
 * const getUserContract = {
 *   method: 'GET',
 *   path: '/users/:id',
 *   params: Type.Object({ id: Type.String() }),
 *   response: ApiResponseSchema(Type.Object({
 *     id: Type.String(),
 *     name: Type.String(),
 *   })),
 * } as const;
 *
 * app.bind(getUserContract, async (c) => {
 *   const user = await db.getUser(c.params.id);
 *   if (!user) {
 *     return error(c, 'User not found', 404);
 *   }
 *   return success(c, user);
 * });
 * ```
 */

import type { TSchema } from '@sinclair/typebox';
import { Type } from '@sinclair/typebox';
import type { RouteContext } from './types.js';
import type { ErrorResponse } from '../middleware/error-handler.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Success response wrapper
 */
export interface ApiSuccessResponse<T = any> {
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
export function ApiSuccessSchema<T extends TSchema>(dataSchema: T) {
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
export function ApiErrorSchema() {
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
export function ApiResponseSchema<T extends TSchema>(dataSchema: T) {
  return Type.Union([
    ApiSuccessSchema(dataSchema),
    ApiErrorSchema(),
  ]);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a success response
 *
 * @example
 * ```ts
 * // Simple success
 * return success(c, { id: '123', name: 'John' });
 *
 * // With metadata
 * return success(c, user, { timestamp: new Date().toISOString() });
 *
 * // With custom status
 * return success(c, newUser, undefined, 201);
 * ```
 */
export function success<T, TContract = any>(
  c: RouteContext<TContract>,
  data: T,
  meta?: ApiSuccessResponse<T>['meta'],
  status: number = 200
): Response {
  const response: ApiSuccessResponse<T> = {
    success: true,
    data,
  };

  if (meta) {
    response.meta = meta;
  }

  return c.json(response, status);
}

/**
 * Creates an error response
 *
 * Note: This is a convenience wrapper. ValidationErrors thrown by bind()
 * are automatically handled by ErrorHandler middleware.
 *
 * @example
 * ```ts
 * // Not found
 * return error(c, 'User not found', 404);
 *
 * // Validation error with details
 * return error(c, 'Invalid input', 400, { fields: ['email', 'password'] });
 * ```
 */
export function error<TContract = any>(
  c: RouteContext<TContract>,
  message: string,
  statusCode: number = 400,
  details?: any
): Response {
  const response: ApiErrorResponse = {
    success: false,
    error: {
      message,
      type: getErrorType(statusCode),
      statusCode,
    },
  };

  if (details) {
    response.error.details = details;
  }

  return c.json(response, statusCode);
}

/**
 * Creates a paginated success response
 *
 * @example
 * ```ts
 * const { users, total } = await db.listUsers(page, limit);
 * return paginated(c, users, page, limit, total);
 * ```
 */
export function paginated<T, TContract = any>(
  c: RouteContext<TContract>,
  data: T[],
  page: number,
  limit: number,
  total: number
): Response {
  return success(c, data, {
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

// ============================================================================
// Utilities
// ============================================================================

function getErrorType(statusCode: number): string {
  if (statusCode >= 500) return 'InternalServerError';
  if (statusCode === 404) return 'NotFoundError';
  if (statusCode === 401) return 'UnauthorizedError';
  if (statusCode === 403) return 'ForbiddenError';
  if (statusCode === 400) return 'ValidationError';
  if (statusCode === 409) return 'ConflictError';
  if (statusCode === 422) return 'UnprocessableEntityError';
  return 'ClientError';
}