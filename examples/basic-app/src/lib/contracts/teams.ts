import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';

/**
 * Teams Contracts
 *
 * Example contracts with absolute paths for new contract system
 */

const TeamSchema = Type.Object({
    id: Type.Number(),
    name: Type.String(),
    slug: Type.String(),
});

/**
 * GET /teams - List teams
 */
export const getTeamsContract = {
    method: 'GET' as const,
    path: '/teams',  // ← Absolute path!
    response: Type.Object({
        teams: Type.Array(TeamSchema),
        total: Type.Number(),
    })
} as const satisfies RouteContract;

/**
 * GET /teams/:id - Get single team
 */
export const getTeamContract = {
    method: 'GET' as const,
    path: '/teams/:id',  // ← Absolute path!
    params: Type.Object({
        id: Type.Integer()
    }),
    response: TeamSchema
} as const satisfies RouteContract;

/**
 * POST /teams - Create team
 */
export const createTeamContract = {
    method: 'POST' as const,
    path: '/teams',  // ← Absolute path!
    body: Type.Object({
        name: Type.String(),
        slug: Type.String(),
    }),
    response: TeamSchema
} as const satisfies RouteContract;

/**
 * PUT /teams/:id - Update team
 */
export const updateTeamContract = {
    method: 'PUT' as const,
    path: '/teams/:id',  // ← Absolute path!
    params: Type.Object({
        id: Type.Integer()
    }),
    body: Type.Object({
        name: Type.Optional(Type.String()),
        slug: Type.Optional(Type.String()),
    }),
    response: TeamSchema
} as const satisfies RouteContract;

/**
 * DELETE /teams/:id - Delete team
 */
export const deleteTeamContract = {
    method: 'DELETE' as const,
    path: '/teams/:id',  // ← Absolute path!
    params: Type.Object({
        id: Type.Integer()
    }),
    response: Type.Object({
        success: Type.Boolean()
    })
} as const satisfies RouteContract;