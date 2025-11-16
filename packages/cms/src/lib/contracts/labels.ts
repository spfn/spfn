import { Type } from '@sinclair/typebox';
import { defineContract, ApiSuccessSchema } from '@spfn/core/route/types';

/**
 * CMS Labels Contracts
 *
 * Label metadata management API
 */

// ===== Common Schema Definitions =====

/**
 * Label type enum
 */
const LabelTypeSchema = Type.Union([
    Type.Literal('text'),
    Type.Literal('image'),
    Type.Literal('video'),
    Type.Literal('file'),
    Type.Literal('object')
], { description: 'Value type' });

/**
 * Label base information schema
 */
const LabelBaseSchema = Type.Object({
    id: Type.Number(),
    key: Type.String(),
    section: Type.String(),
    type: Type.String(),
    description: Type.Union([Type.String(), Type.Null()]),
    publishedVersion: Type.Union([Type.Number(), Type.Null()]),
    createdBy: Type.Union([Type.String(), Type.Null()]),
    createdAt: Type.Date(),
    updatedAt: Type.Date()
});

/**
 * Label value schema (common for Draft/Published)
 */
const LabelValueSchema = Type.Object({
    id: Type.Number(),
    labelId: Type.Number(),
    locale: Type.String(),
    breakpoint: Type.Union([Type.String(), Type.Null()]),
    value: Type.Any(),
    createdAt: Type.String()
});

/**
 * Draft label value schema
 */
const DraftLabelValueSchema = Type.Intersect([
    LabelValueSchema,
    Type.Object({
        version: Type.Null()
    })
]);

/**
 * Published label value schema
 */
const PublishedLabelValueSchema = Type.Intersect([
    LabelValueSchema,
    Type.Object({
        version: Type.Number()
    })
]);

/**
 * Label status enum
 */
const LabelStatusSchema = Type.Union([
    Type.Literal('default-only'),
    Type.Literal('unpublished'),
    Type.Literal('published'),
    Type.Literal('modified')
]);

/**
 * ID parameter schema
 */
const LabelIdParamsSchema = Type.Object({
    id: Type.Number({ description: 'Label ID' })
});

// ===== API Contracts =====

/**
 * GET /_cms/labels - Get label list
 */
export const getLabelsContract = defineContract({
    method: 'GET',
    path: '/_cms/labels',
    query: Type.Object({
        section: Type.Optional(Type.String({ description: 'Filter by section (e.g., home, why-futureplay)' })),
        includeDefaultValues: Type.Optional(Type.Boolean({ description: 'Include default values' }))
    }),
    response: ApiSuccessSchema(Type.Object({
        labels: Type.Array(Type.Intersect([
            LabelBaseSchema,
            Type.Object({
                defaultValue: Type.Optional(Type.Any({ description: 'Default value from label definition file' }))
            })
        ])),
        total: Type.Number()
    })),
    meta: {
        skipMiddlewares: ['auth']
    }
});

/**
 * POST /_cms/labels - Create a new label
 */
export const createLabelContract = defineContract({
    method: 'POST',
    path: '/_cms/labels',
    body: Type.Object({
        key: Type.String({
            description: 'Unique key (e.g., home.hero.title)',
            pattern: '^[a-z0-9-]+\\.[a-z0-9-]+\\.[a-z0-9-]+$'
        }),
        section: Type.String({
            description: 'Section name (e.g., home, why-futureplay)',
            pattern: '^[a-z0-9-]+$'
        }),
        type: LabelTypeSchema,
        createdBy: Type.Optional(Type.String({ description: 'Creator ID' }))
    }),
    response: ApiSuccessSchema(LabelBaseSchema)
});

/**
 * GET /_cms/labels/:id - Get a single label
 */
export const getLabelContract = defineContract({
    method: 'GET',
    path: '/_cms/labels/:id',
    params: LabelIdParamsSchema,
    response: ApiSuccessSchema(LabelBaseSchema)
});

/**
 * PATCH /_cms/labels/:id - Update label metadata
 */
export const updateLabelContract = defineContract({
    method: 'PATCH',
    path: '/_cms/labels/:id',
    params: LabelIdParamsSchema,
    body: Type.Object({
        section: Type.Optional(Type.String({ description: 'Change section' })),
        type: Type.Optional(LabelTypeSchema)
    }),
    response: ApiSuccessSchema(LabelBaseSchema)
});

/**
 * DELETE /_cms/labels/:id - Delete a label
 */
export const deleteLabelContract = defineContract({
    method: 'DELETE',
    path: '/_cms/labels/:id',
    params: LabelIdParamsSchema,
    response: ApiSuccessSchema(Type.Object({
        id: Type.Number()
    }))
});

/**
 * GET /_cms/labels/by-key/:key - Get label by key
 */
export const getLabelByKeyContract = defineContract({
    method: 'GET',
    path: '/_cms/labels/by-key/:key',
    params: Type.Object({
        key: Type.String({ description: 'Label key (e.g., home.hero.title)' })
    }),
    response: ApiSuccessSchema(LabelBaseSchema),
    meta: {
        skipMiddlewares: ['auth']
    }
});

/**
 * POST /_cms/labels/:id/publish - Publish label (Draft → Published)
 */
export const publishLabelContract = defineContract({
    method: 'POST',
    path: '/_cms/labels/:id/publish',
    params: LabelIdParamsSchema,
    body: Type.Object({
        notes: Type.Optional(Type.String({ description: 'Publish notes (version description)' })),
        publishedBy: Type.Optional(Type.String({ description: 'Publisher ID' }))
    }),
    response: ApiSuccessSchema(Type.Object({
        id: Type.Number(),
        version: Type.Number(),
        message: Type.String()
    }))
});

/**
 * GET /_cms/labels/:id/admin - Get label for admin (Draft + Published + Status)
 */
export const getAdminLabelContract = defineContract({
    method: 'GET',
    path: '/_cms/labels/:id/admin',
    params: LabelIdParamsSchema,
    response: ApiSuccessSchema(Type.Object({
        label: LabelBaseSchema,
        draft: Type.Array(DraftLabelValueSchema),
        published: Type.Array(PublishedLabelValueSchema),
        status: LabelStatusSchema
    }))
});

/**
 * GET /_cms/labels/:id/versions - Get label version history
 */
export const getLabelVersionsContract = defineContract({
    method: 'GET',
    path: '/_cms/labels/:id/versions',
    params: LabelIdParamsSchema,
    response: ApiSuccessSchema(Type.Object({
        versions: Type.Array(Type.Object({
            version: Type.Number({ description: 'Version number' }),
            publishedAt: Type.String({ description: 'Published time (ISO 8601)' }),
            publishedBy: Type.Union([Type.String(), Type.Null()], { description: 'Publisher ID' }),
            notes: Type.Union([Type.String(), Type.Null()], { description: 'Publish notes' }),
            values: Type.Array(Type.Omit(LabelValueSchema, ['labelId']))
        }))
    }))
});