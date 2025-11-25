/**
 * CMS Labels Route Schemas
 *
 * Common TypeBox schemas for label routes
 */

import { Type } from '@sinclair/typebox';

/**
 * Label type enum
 */
export const LabelTypeSchema = Type.Union([
    Type.Literal('text'),
    Type.Literal('image'),
    Type.Literal('video'),
    Type.Literal('file'),
    Type.Literal('object')
], {
    description: 'Value type'
});

/**
 * Label ID parameter
 */
export const LabelIdParamsSchema = Type.Object({
    id: Type.Number({
        description: 'Label ID'
    })
});

/**
 * Label key parameter
 */
export const LabelKeyParamsSchema = Type.Object({
    key: Type.String({
        description: 'Label key (e.g., home.hero.title)'
    })
});

/**
 * Label status enum
 */
export const LabelStatusSchema = Type.Union([
    Type.Literal('default-only'),
    Type.Literal('unpublished'),
    Type.Literal('published'),
    Type.Literal('modified')
], {
    description: 'Label status'
});

/**
 * Label Status Type
 */
export type LabelStatus = 'default-only' | 'unpublished' | 'published' | 'modified';