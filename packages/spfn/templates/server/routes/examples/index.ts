/**
 * Example Routes: CRUD Operations
 *
 * File naming patterns:
 * - routes/index/index.ts -> / (root route)
 * - routes/users/index.ts -> /users
 * - routes/users/[id]/index.ts -> /users/:id (dynamic parameter)
 *
 * Contracts are co-located in the same directory
 */

import { createApp } from '@spfn/core/route';
import {
    getExamplesContract,
    getExampleContract,
    createExampleContract,
    updateExampleContract,
    deleteExampleContract
} from './contract.js';

const app = createApp();

// GET /examples - List examples with pagination
app.bind(getExamplesContract, async (c) =>
{
    const { limit = 10, offset = 0 } = c.query;

    // Mock data - replace with actual database queries
    const examples = [
        {
            id: '1',
            name: 'File-based Routing',
            description: 'Next.js style automatic route registration'
        },
        {
            id: '2',
            name: 'Contract-based Validation',
            description: 'TypeBox schemas for end-to-end type safety'
        },
        {
            id: '3',
            name: 'Auto-generated Types',
            description: 'Client code generation from contracts'
        }
    ];

    return c.json({
        examples: examples.slice(offset, offset + limit),
        total: examples.length,
        limit,
        offset
    });
});

// GET /examples/:id - Get single example
app.bind(getExampleContract, async (c) =>
{
    const { id } = c.params;

    // Mock data - replace with actual database query
    const example = {
        id,
        name: 'Example ' + id,
        description: 'This is an example',
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    return c.json(example);
});

// POST /examples - Create example
app.bind(createExampleContract, async (c) =>
{
    const body = await c.data();

    // Mock data - replace with actual database insert
    const example = {
        id: Math.random().toString(36).substring(7),
        name: body.name,
        description: body.description,
        createdAt: Date.now()
    };

    return c.json(example);
});

// PUT /examples/:id - Update example
app.bind(updateExampleContract, async (c) =>
{
    const { id } = c.params;
    const body = await c.data();

    // Mock data - replace with actual database update
    const example = {
        id,
        name: body.name || 'Updated Example',
        description: body.description || 'Updated description',
        updatedAt: Date.now()
    };

    return c.json(example);
});

// DELETE /examples/:id - Delete example
app.bind(deleteExampleContract, async (c) =>
{
    const { id } = c.params;

    // Mock data - replace with actual database delete
    return c.json({
        success: true,
        id
    });
});

export default app;