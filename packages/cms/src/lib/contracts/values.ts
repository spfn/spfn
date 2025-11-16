import { Type } from '@sinclair/typebox';
import { defineContract, ApiSuccessSchema } from '@spfn/core/route/types';

// ===== Common Schema Definitions =====

/**
 * Label Value Type Definition
 * All types must be stored as objects
 */
const LabelValueSchema = Type.Object({
    type: Type.Union([
        Type.Literal('text'),
        Type.Literal('image'),
        Type.Literal('video'),
        Type.Literal('file'),
        Type.Literal('object')
    ]),
    content: Type.Optional(Type.String()), // text type
    url: Type.Optional(Type.String()), // image, video, file types (required for these types but optional in schema)
    alt: Type.Optional(Type.String()), // image type
    width: Type.Optional(Type.Number()), // image type
    height: Type.Optional(Type.Number()), // image type
    thumbnail: Type.Optional(Type.String()), // video type
    duration: Type.Optional(Type.Number()), // video type
    filename: Type.Optional(Type.String()), // file type
    size: Type.Optional(Type.Number()), // file type
    fields: Type.Optional(Type.Any()) // object type - recursive structure
});

/**
 * Responsive breakpoint enum
 */
const BreakpointSchema = Type.Union([
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
const ValueItemSchema = Type.Object({
    locale: Type.String({ description: 'Language code (ko, en, ja)', default: 'ko' }),
    breakpoint: Type.Optional(BreakpointSchema),
    value: LabelValueSchema
});

/**
 * Saved value item schema (includes id + createdAt)
 */
const SavedValueItemSchema = Type.Object({
    id: Type.Number(),
    locale: Type.String(),
    breakpoint: Type.Union([Type.String(), Type.Null()]),
    value: Type.Any(),
    createdAt: Type.String()
});

// ===== API Contracts =====

/**
 * POST /_cms/values/:labelId - Save label values
 * - version: null → Save as draft (overwrite)
 * - version: number → Create published version (immutable)
 */
export const saveValuesContract = defineContract({
    method: 'POST',
    path: '/_cms/values/:labelId',
    params: Type.Object({
        labelId: Type.Number({ description: 'Label ID' })
    }),
    body: Type.Object({
        version: Type.Union([
            Type.Null({ description: 'Save as draft (overwrite)' }),
            Type.Number({ description: 'Version number (immutable)', minimum: 1 })
        ]),
        values: Type.Array(ValueItemSchema)
    }),
    response: ApiSuccessSchema(Type.Object({
        saved: Type.Number(),
        version: Type.Union([Type.Null(), Type.Number()])
    }))
});

/**
 * GET /_cms/values/:labelId/:version - Get values for a specific version
 */
export const getValuesContract = defineContract({
    method: 'GET',
    path: '/_cms/values/:labelId/:version',
    params: Type.Object({
        labelId: Type.Number({ description: 'Label ID' }),
        version: Type.Number({ description: 'Version number' })
    }),
    query: Type.Object({
        locale: Type.Optional(Type.String({ description: 'Language code (ko, en, ja)' })),
        breakpoint: Type.Optional(Type.String({ description: 'Responsive breakpoint' }))
    }),
    response: ApiSuccessSchema(Type.Object({
        labelId: Type.Number(),
        version: Type.Number(),
        values: Type.Array(SavedValueItemSchema)
    }))
});