/**
 * Published Cache Schema Definitions
 */

import { Type } from '@sinclair/typebox';

/**
 * GET /_cms/published-cache query schema
 */
export const SectionsQuerySchema = Type.Object({
    sections: Type.Union([
        Type.String({ description: 'Single section name (e.g., home)' }),
        Type.Array(Type.String(), { description: 'Multiple section names (e.g., ["home", "footer"])' })
    ]),
    locale: Type.String({ description: 'Language code (e.g., ko, en, ja)' })
});

/**
 * POST /_cms/published-cache body schema
 */
export const UpsertCacheBodySchema = Type.Object({
    section: Type.String({ description: 'Section name (e.g., home)' }),
    locale: Type.String({ description: 'Language code (e.g., ko, en, ja)' }),
    content: Type.Record(Type.String(), Type.Any(), { description: 'Content to publish (key-value format)' }),
    version: Type.Number({ description: 'Version number' })
});