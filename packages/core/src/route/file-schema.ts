/**
 * File Schema Helpers for TypeBox
 *
 * Provides TypeBox schema definitions for file upload handling
 * with optional validation constraints.
 */

import { Kind, Type, type TSchema } from '@sinclair/typebox';

// ============================================================================
// Types
// ============================================================================

/**
 * File validation options
 */
export interface FileSchemaOptions
{
    /**
     * Maximum file size in bytes
     *
     * @example 5 * 1024 * 1024 // 5MB
     */
    maxSize?: number;

    /**
     * Allowed MIME types
     *
     * @example ['image/jpeg', 'image/png', 'image/webp']
     */
    allowedTypes?: string[];

    /**
     * Minimum file size in bytes (optional)
     *
     * @example 1024 // 1KB minimum
     */
    minSize?: number;
}

/**
 * File array validation options
 */
export interface FileArraySchemaOptions extends FileSchemaOptions
{
    /**
     * Maximum number of files
     *
     * @example 5
     */
    maxFiles?: number;

    /**
     * Minimum number of files (optional)
     *
     * @example 1
     */
    minFiles?: number;
}

/**
 * Internal schema type with file validation metadata
 */
export interface FileSchemaType extends TSchema
{
    [Kind]: 'File';
    fileOptions?: FileSchemaOptions;
}

export interface FileArraySchemaType extends TSchema
{
    [Kind]: 'FileArray';
    fileOptions?: FileArraySchemaOptions;
}

// ============================================================================
// Schema Creators
// ============================================================================

/**
 * Create a File schema with optional validation
 *
 * @example
 * ```ts
 * // Basic usage (no validation)
 * formData: Type.Object({
 *     file: FileSchema()
 * })
 *
 * // With validation
 * formData: Type.Object({
 *     avatar: FileSchema({
 *         maxSize: 5 * 1024 * 1024,  // 5MB
 *         allowedTypes: ['image/jpeg', 'image/png', 'image/webp']
 *     })
 * })
 * ```
 */
export function FileSchema(options?: FileSchemaOptions): FileSchemaType
{
    return Type.Unsafe<File>({
        [Kind]: 'File',
        type: 'object',
        fileOptions: options,
    }) as FileSchemaType;
}

/**
 * Create a File array schema with optional validation
 *
 * @example
 * ```ts
 * // Basic usage (no validation)
 * formData: Type.Object({
 *     files: FileArraySchema()
 * })
 *
 * // With validation
 * formData: Type.Object({
 *     documents: FileArraySchema({
 *         maxSize: 10 * 1024 * 1024,  // 10MB per file
 *         maxFiles: 5,
 *         allowedTypes: ['application/pdf', 'application/msword']
 *     })
 * })
 * ```
 */
export function FileArraySchema(options?: FileArraySchemaOptions): FileArraySchemaType
{
    return Type.Unsafe<File[]>({
        [Kind]: 'FileArray',
        type: 'array',
        items: { [Kind]: 'File', type: 'object' },
        fileOptions: options,
    }) as FileArraySchemaType;
}

/**
 * Create an optional File schema with validation
 *
 * @example
 * ```ts
 * formData: Type.Object({
 *     name: Type.String(),
 *     avatar: OptionalFileSchema({
 *         maxSize: 2 * 1024 * 1024,
 *         allowedTypes: ['image/jpeg', 'image/png']
 *     })
 * })
 * ```
 */
export function OptionalFileSchema(options?: FileSchemaOptions): TSchema
{
    return Type.Optional(FileSchema(options));
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if a schema is a File schema
 */
export function isFileSchema(schema: TSchema): schema is FileSchemaType
{
    const kind = (schema as any)[Symbol.for('TypeBox.Kind')];
    return kind === 'File';
}

/**
 * Check if a schema is a FileArray schema
 */
export function isFileArraySchema(schema: TSchema): schema is FileArraySchemaType
{
    const kind = (schema as any)[Symbol.for('TypeBox.Kind')];
    return kind === 'FileArray';
}

/**
 * Get file options from schema
 */
export function getFileOptions(schema: TSchema): FileSchemaOptions | FileArraySchemaOptions | undefined
{
    return (schema as any).fileOptions;
}

/**
 * Format file size for error messages
 */
export function formatFileSize(bytes: number): string
{
    if (bytes >= 1024 * 1024 * 1024)
    {
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
    }
    if (bytes >= 1024 * 1024)
    {
        return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    }
    if (bytes >= 1024)
    {
        return `${(bytes / 1024).toFixed(1)}KB`;
    }
    return `${bytes}B`;
}
