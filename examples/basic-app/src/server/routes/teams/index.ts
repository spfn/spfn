/**
 * Teams Routes
 *
 * Demonstrates new contract system with absolute paths
 * - Contracts in lib/contracts/ (shared with frontend)
 * - Handlers can be anywhere in routes/
 * - File structure is flexible!
 */

import { createApp } from '@spfn/core/route';
import {
    getTeamsContract,
    getTeamContract,
    createTeamContract,
    updateTeamContract,
    deleteTeamContract
} from '@/lib/contracts/teams';

const app = createApp();

// Mock data
const teams = [
    { id: 1, name: 'Leadership Team', slug: 'leadership' },
    { id: 2, name: 'Engineering Team', slug: 'engineering' },
    { id: 3, name: 'Design Team', slug: 'design' },
];

// GET /teams - List teams
app.bind(getTeamsContract, async (c) =>
{
    return c.json({
        teams,
        total: teams.length,
    });
});

// GET /teams/:id - Get single team
app.bind(getTeamContract, async (c) =>
{
    const { id } = c.params;
    const team = teams.find(t => t.id === id);

    if (!team)
    {
        return c.json(teams[0]); // Return first team as fallback for demo
    }

    return c.json(team);
});

// POST /teams - Create team
app.bind(createTeamContract, async (c) =>
{
    const body = await c.data();

    const newTeam = {
        id: Math.max(...teams.map(t => t.id)) + 1,
        name: body.name,
        slug: body.slug,
    };

    teams.push(newTeam);

    return c.json(newTeam);
});

// PUT /teams/:id - Update team
app.bind(updateTeamContract, async (c) =>
{
    const { id } = c.params;
    const body = await c.data();

    const team = teams.find(t => t.id === id);

    if (!team)
    {
        return c.json(teams[0]); // Return first team as fallback for demo
    }

    if (body.name) team.name = body.name;
    if (body.slug) team.slug = body.slug;

    return c.json(team);
});

// DELETE /teams/:id - Delete team
app.bind(deleteTeamContract, async (c) =>
{
    const { id } = c.params;
    const index = teams.findIndex(t => t.id === id);

    if (index !== -1)
    {
        teams.splice(index, 1);
    }

    return c.json({ success: true });
});

export default app;