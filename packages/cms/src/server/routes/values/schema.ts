/**
 * Values Schema Definitions
 */

import { Type } from '@sinclair/typebox';

/**
 * Label Value Type Definition
 * All types must be stored as objects
 */
export const LabelValueSchema = Type.Object({
    type: Type.Union([
        Type.Literal('text'),
        Type.Literal('image'),
        Type.Literal('video'),
        Type.Literal('file'),
        Type.Literal('object')
    ]),
    content: Type.Optional(Type.String()),
    url: Type.Optional(Type.String()),
    alt: Type.Optional(Type.String()),
    width: Type.Optional(Type.Number()),
    height: Type.Optional(Type.Number()),
    thumbnail: Type.Optional(Type.String()),
    duration: Type.Optional(Type.Number()),
    filename: Type.Optional(Type.String()),
    size: Type.Optional(Type.Number()),
    fields: Type.Optional(Type.Any())
});

/**
 * Responsive breakpoint enum
 */
export const BreakpointSchema = Type.Union([
    Type.Literal('sm'),
    Type.Literal('md'),
    Type.Literal('lg'),
    Type.Literal('xl'),
    Type.Literal('2xl'),
    Type.Null()
], { description: 'Responsive breakpoint' });

/**
 * Value item schema (locale + breakpoint + value)
 */
export const ValueItemSchema = Type.Object({
    locale: Type.String({ description: 'Language code (ko, en, ja)', default: 'ko' }),
    breakpoint: Type.Optional(BreakpointSchema),
    value: LabelValueSchema
});

/**
 * POST /_cms/values/:labelId params schema
 */
export const LabelIdParamsSchema = Type.Object({
    labelId: Type.Number({ description: 'Label ID' })
});

/**
 * GET /_cms/values/:labelId/:version params schema
 */
export const LabelVersionParamsSchema = Type.Object({
    labelId: Type.Number({ description: 'Label ID' }),
    version: Type.Number({ description: 'Version number' })
});

/**
 * GET /_cms/values/:labelId/:version query schema
 */
export const ValuesQuerySchema = Type.Object({
    locale: Type.Optional(Type.String({ description: 'Language code (ko, en, ja)' })),
    breakpoint: Type.Optional(Type.String({ description: 'Responsive breakpoint' }))
});

/**
 * POST /_cms/values/:labelId body schema
 */
export const SaveValuesBodySchema = Type.Object({
    version: Type.Union([
        Type.Null({ description: 'Save as draft (overwrite)' }),
        Type.Number({ description: 'Version number (immutable)', minimum: 1 })
    ]),
    values: Type.Array(ValueItemSchema)
});