'use client';

/**
 * Teams Client Component
 *
 * Interactive CRUD interface for teams
 */

import { useState } from 'react';
import { api } from '@/lib/api-client';
import type { Team } from '@/server/entities/team.entity';

interface TeamsClientProps
{
    initialTeams: Team[];
    initialTotal: number;
}

export default function TeamsClient({ initialTeams, initialTotal }: TeamsClientProps)
{
    const [teams, setTeams] = useState<Team[]>(initialTeams);
    const [total, setTotal] = useState(initialTotal);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Create form state
    const [name, setName] = useState('');
    const [slug, setSlug] = useState('');

    // Edit state
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editName, setEditName] = useState('');
    const [editSlug, setEditSlug] = useState('');

    // Refresh teams list
    const refreshTeams = async () =>
    {
        try
        {
            setLoading(true);
            setError(null);
            const { teams: newTeams, total: newTotal } = await api.listTeams.call();
            setTeams(newTeams);
            setTotal(newTotal);
        }
        catch (err)
        {
            const error = err as Error;
            setError(error.message || 'Failed to fetch teams');
        }
        finally
        {
            setLoading(false);
        }
    };

    // Create team
    const handleCreate = async (e: React.FormEvent) =>
    {
        e.preventDefault();

        if (!name.trim() || !slug.trim())
        {
            setError('Name and slug are required');
            return;
        }

        try
        {
            setLoading(true);
            setError(null);
            await api.createTeam.body({ name, slug }).call();
            setName('');
            setSlug('');
            await refreshTeams();
        }
        catch (err)
        {
            const error = err as Error;
            setError(error.message || 'Failed to create team');
        }
        finally
        {
            setLoading(false);
        }
    };

    // Start editing
    const startEdit = (team: Team) =>
    {
        setEditingId(team.id);
        setEditName(team.name);
        setEditSlug(team.slug);
        setError(null);
    };

    // Cancel editing
    const cancelEdit = () =>
    {
        setEditingId(null);
        setEditName('');
        setEditSlug('');
        setError(null);
    };

    // Update team
    const handleUpdate = async (id: number) =>
    {
        if (!editName.trim() || !editSlug.trim())
        {
            setError('Name and slug are required');
            return;
        }

        try
        {
            setLoading(true);
            setError(null);
            await api.updateTeam
                .params({ id })
                .body({ name: editName, slug: editSlug })
                .call();
            setEditingId(null);
            await refreshTeams();
        }
        catch (err)
        {
            const error = err as Error;
            setError(error.message || 'Failed to update team');
        }
        finally
        {
            setLoading(false);
        }
    };

    // Delete team
    const handleDelete = async (id: number) =>
    {
        if (!confirm('Are you sure you want to delete this team?'))
        {
            return;
        }

        try
        {
            setLoading(true);
            setError(null);
            await api.deleteTeam.params({ id }).call();
            await refreshTeams();
        }
        catch (err)
        {
            const error = err as Error;
            setError(error.message || 'Failed to delete team');
        }
        finally
        {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-8">
            {/* Error Display */}
            { error && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 p-4">
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                        <span className="font-medium">Error:</span>
                        <span>{ error }</span>
                    </div>
                </div>
            ) }

            {/* Create Team Form */}
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-6">
                <h2 className="text-xl font-semibold mb-4">Create New Team</h2>
                <form onSubmit={handleCreate} className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                            <label htmlFor="name" className="text-sm font-medium">
                                Team Name
                            </label>
                            <input
                                id="name"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Engineering Team"
                                className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                disabled={loading}
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label htmlFor="slug" className="text-sm font-medium">
                                Slug (unique)
                            </label>
                            <input
                                id="slug"
                                type="text"
                                value={slug}
                                onChange={(e) => setSlug(e.target.value)}
                                placeholder="engineering-team"
                                className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                disabled={loading}
                            />
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full md:w-auto rounded-md bg-black dark:bg-white text-white dark:text-black px-6 py-2 font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        { loading ? 'Creating...' : 'Create Team' }
                    </button>
                </form>
            </div>

            {/* Teams List */}
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                <div className="bg-zinc-50 dark:bg-zinc-900 px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
                    <h2 className="text-xl font-semibold">
                        Teams ({ total })
                    </h2>
                </div>

                { teams.length === 0 ? (
                    <div className="p-8 text-center text-zinc-500">
                        No teams yet. Create one above!
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                        ID
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                        Name
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                        Slug
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                        Created
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                                { teams.map((team) => (
                                    <tr key={team.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-900 dark:text-zinc-100">
                                            { team.id }
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            { editingId === team.id ? (
                                                <input
                                                    type="text"
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                    className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    disabled={loading}
                                                />
                                            ) : (
                                                <span className="text-zinc-900 dark:text-zinc-100 font-medium">
                                                    { team.name }
                                                </span>
                                            ) }
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            { editingId === team.id ? (
                                                <input
                                                    type="text"
                                                    value={editSlug}
                                                    onChange={(e) => setEditSlug(e.target.value)}
                                                    className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    disabled={loading}
                                                />
                                            ) : (
                                                <code className="text-zinc-600 dark:text-zinc-400">
                                                    { team.slug }
                                                </code>
                                            ) }
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">
                                            { new Date(team.createdAt).toLocaleDateString() }
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                            { editingId === team.id ? (
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => handleUpdate(team.id)}
                                                        disabled={loading}
                                                        className="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 font-medium disabled:opacity-50"
                                                    >
                                                        Save
                                                    </button>
                                                    <button
                                                        onClick={cancelEdit}
                                                        disabled={loading}
                                                        className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 font-medium disabled:opacity-50"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => startEdit(team)}
                                                        disabled={loading}
                                                        className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium disabled:opacity-50"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(team.id)}
                                                        disabled={loading}
                                                        className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium disabled:opacity-50"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            ) }
                                        </td>
                                    </tr>
                                )) }
                            </tbody>
                        </table>
                    </div>
                ) }
            </div>

            {/* Refresh Button */}
            <button
                onClick={refreshTeams}
                disabled={loading}
                className="w-full md:w-auto rounded-md border border-zinc-200 dark:border-zinc-800 px-6 py-2 font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
                { loading ? 'Refreshing...' : 'Refresh Teams' }
            </button>
        </div>
    );
}