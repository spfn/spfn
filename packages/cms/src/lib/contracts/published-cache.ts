import { Type } from '@sinclair/typebox';
import { defineContract, ApiSuccessSchema } from '@spfn/core/route/types';

/**
 * Section data schema
 */
const SectionDataSchema = Type.Object({
    section: Type.String(),
    locale: Type.String(),
    content: Type.Record(Type.String(), Type.Any()),
    version: Type.Number(),
    publishedAt: Type.Union([Type.String(), Type.Null()]),
});

/**
 * GET /_cms/published-cache
 * Get published content cache (single or multiple sections)
 */
export const getPublishedCacheContract = defineContract({
    method: 'GET',
    path: '/_cms/published-cache',
    query: Type.Object({
        sections: Type.Union([
            Type.String({ description: 'Single section name (e.g., home)' }),
            Type.Array(Type.String(), { description: 'Multiple section names (e.g., ["home", "footer"])' })
        ]),
        locale: Type.String({ description: 'Language code' }),
    }),
    response: ApiSuccessSchema(Type.Array(SectionDataSchema)),
    meta: {
        skipMiddlewares: ['auth']
    }
});

/**
 * POST /_cms/published-cache
 * Update/create published content cache (upsert)
 */
export const upsertPublishedCacheContract = defineContract({
    method: 'POST',
    path: '/_cms/published-cache',
    body: Type.Object({
        section: Type.String({ description: 'Section name (e.g., home)' }),
        locale: Type.String({ description: 'Language code (e.g., ko, en, ja)' }),
        content: Type.Record(Type.String(), Type.Any(), { description: 'Content to publish (key-value format)' }),
        version: Type.Number({ description: 'Version number' })
    }),
    response: ApiSuccessSchema(SectionDataSchema)
});