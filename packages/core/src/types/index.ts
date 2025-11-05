/**
 * @spfn/core/types
 *
 * Pure type definitions and TypeBox schemas.
 * Safe to use in both server and client code.
 */

export {
    // Types
    type ErrorResponse,
    type ApiSuccessResponse,
    type ApiErrorResponse,
    type ApiResponse,
    // Schema helpers
    ApiSuccessSchema,
    ApiErrorSchema,
    ApiResponseSchema,
} from './api-response.js';
