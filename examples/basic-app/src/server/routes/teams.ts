/**
 * Teams Routes
 *
 * Demonstrates define-route system with CRUD operations and Repository pattern
 */

import { route } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';
import { TeamRepository } from '../repositories/team.repository';

const teamRepo = new TeamRepository();

/**
 * GET /teams - List teams
 */
export const listTeams = route.get('/teams')
    .skip(['auth'])
    .handler(async (c) =>
    {
        const teams = await teamRepo.findAll();
        const total = await teamRepo.countAll();

        return {
            teams,
            total,
        };
    });

/**
 * GET /teams/:id - Get single team
 */
export const getTeam = route.get('/teams/:id')
    .skip(['auth'])
    .input({
        params: Type.Object({
            id: Type.Number(),
        }),
    })
    .handler(async (c) =>
    {
        const { params } = await c.data();
        const team = await teamRepo.findById(params.id);

        if (!team)
        {
            throw new Error('Team not found');
        }

        return team;
    });

/**
 * POST /teams - Create team
 */
export const createTeam = route.post('/teams')
    .skip(['auth'])
    .input({
        body: Type.Object({
            name: Type.String(),
            slug: Type.String(),
        }),
    })
    .handler(async (c) =>
    {
        const { body } = await c.data();
        const team = await teamRepo.createTeam(body);

        return team;
    });

/**
 * PUT /teams/:id - Update team
 */
export const updateTeam = route.put('/teams/:id')
    .skip(['auth'])
    .input({
        params: Type.Object({
            id: Type.Number(),
        }),
        body: Type.Object({
            name: Type.Optional(Type.String()),
            slug: Type.Optional(Type.String()),
        }),
    })
    .handler(async (c) =>
    {
        const { params, body } = await c.data();
        const team = await teamRepo.updateTeam(params.id, body);

        if (!team)
        {
            throw new Error('Team not found');
        }

        return team;
    });

/**
 * DELETE /teams/:id - Delete team
 */
export const deleteTeam = route.delete('/teams/:id')
    .skip(['auth'])
    .input({
        params: Type.Object({
            id: Type.Number(),
        }),
    })
    .handler(async (c) =>
    {
        const { params } = await c.data();
        const team = await teamRepo.deleteTeam(params.id);

        if (!team)
        {
            throw new Error('Team not found');
        }

        return { success: true };
    });