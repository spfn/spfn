/**
 * @spfn/auth - TypeBox Schemas
 *
 * Common response schemas for contract definitions
 */

import { Type, TObject } from '@sinclair/typebox';

/**
 * Success response schema wrapper
 *
 * Wraps a data schema with success: true and optional message
 */
export const SuccessResponseSchema = <T extends TObject>(dataSchema: T) =>
    Type.Object(
        {
            success: Type.Literal(true),
            data: dataSchema,
            message: Type.Optional(Type.String()),
        }
    );

/**
 * Error response schema
 *
 * Standard error format with code, message, and optional details
 */
export const ErrorResponseSchema = Type.Object(
    {
        success: Type.Literal(false),
        error: Type.Object(
            {
                code: Type.String(),
                message: Type.String(),
                details: Type.Optional(Type.Any()),
            }
        ),
    }
);

/**
 * API Response schema (union of success and error)
 *
 * Use this to define contract responses that can be either success or error
 */
export const ApiResponseSchema = <T extends TObject>(dataSchema: T) =>
    Type.Union([
        SuccessResponseSchema(dataSchema),
        ErrorResponseSchema,
    ]);