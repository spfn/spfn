'use client';

/**
 * Example List Component
 *
 * Client component for CRUD operations
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api-client';
import type { RouterOutput } from '@spfn/core/nextjs';
import type { AppRouter } from '@/server/router';

type ListExamplesResponse = RouterOutput<AppRouter, 'listExamples'>;
type Example = ListExamplesResponse['items'][number];

interface ExampleListProps
{
    initialData: ListExamplesResponse;
}

export function ExampleList({ initialData }: ExampleListProps)
{
    const [examples, setExamples] = useState<Example[]>(initialData.items);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form state
    const [newName, setNewName] = useState('');
    const [newDescription, setNewDescription] = useState('');

    // Edit state
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editName, setEditName] = useState('');
    const [editDescription, setEditDescription] = useState('');

    const refreshList = async () =>
    {
        setLoading(true);
        setError(null);
        try
        {
            const data = await api.listExamples.call({ query: { limit: 50 } });
            setExamples(data.items);
        }
        catch (err)
        {
            setError(err instanceof Error ? err.message : 'Failed to fetch examples');
        }
        finally
        {
            setLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) =>
    {
        e.preventDefault();
        if (!newName.trim() || !newDescription.trim()) return;

        setLoading(true);
        setError(null);
        try
        {
            await api.createExample.call({
                body: { name: newName, description: newDescription },
            });
            setNewName('');
            setNewDescription('');
            await refreshList();
        }
        catch (err)
        {
            setError(err instanceof Error ? err.message : 'Failed to create example');
        }
        finally
        {
            setLoading(false);
        }
    };

    const handleUpdate = async (id: number) =>
    {
        if (!editName.trim()) return;

        setLoading(true);
        setError(null);
        try
        {
            await api.updateExample.call({
                params: { id },
                body: { name: editName, description: editDescription },
            });
            setEditingId(null);
            await refreshList();
        }
        catch (err)
        {
            setError(err instanceof Error ? err.message : 'Failed to update example');
        }
        finally
        {
            setLoading(false);
        }
    };

    const handleDelete = async (id: number) =>
    {
        if (!confirm('Are you sure you want to delete this example?')) return;

        setLoading(true);
        setError(null);
        try
        {
            await api.deleteExample.call({ params: { id } });
            await refreshList();
        }
        catch (err)
        {
            setError(err instanceof Error ? err.message : 'Failed to delete example');
        }
        finally
        {
            setLoading(false);
        }
    };

    const startEdit = (example: Example) =>
    {
        setEditingId(example.id);
        setEditName(example.name);
        setEditDescription(example.description);
    };

    const cancelEdit = () =>
    {
        setEditingId(null);
        setEditName('');
        setEditDescription('');
    };

    return (
        <div className="space-y-6">
            {/* Create Form */}
            <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6">
                <h2 className="text-lg font-semibold mb-4 text-black dark:text-white">
                    Create New Example
                </h2>
                <form onSubmit={handleCreate} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                            placeholder="Name"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            disabled={loading}
                        />
                        <Input
                            placeholder="Description"
                            value={newDescription}
                            onChange={(e) => setNewDescription(e.target.value)}
                            disabled={loading}
                        />
                    </div>
                    <Button type="submit" disabled={loading || !newName.trim() || !newDescription.trim()}>
                        {loading ? 'Creating...' : 'Create Example'}
                    </Button>
                </form>
            </div>

            {/* Error Message */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-600 dark:text-red-400">
                    {error}
                </div>
            )}

            {/* Examples List */}
            <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-black dark:text-white">
                        Examples ({examples.length})
                    </h2>
                    <Button variant="outline" size="sm" onClick={refreshList} disabled={loading}>
                        {loading ? 'Loading...' : 'Refresh'}
                    </Button>
                </div>

                {examples.length === 0 ? (
                    <div className="p-6 text-center text-zinc-500">
                        No examples yet. Create one above!
                    </div>
                ) : (
                    <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                        {examples.map((example) => (
                            <li key={example.id} className="p-4">
                                {editingId === example.id ? (
                                    /* Edit Mode */
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <Input
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                placeholder="Name"
                                                disabled={loading}
                                            />
                                            <Input
                                                value={editDescription}
                                                onChange={(e) => setEditDescription(e.target.value)}
                                                placeholder="Description"
                                                disabled={loading}
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                onClick={() => handleUpdate(example.id)}
                                                disabled={loading || !editName.trim()}
                                            >
                                                {loading ? 'Saving...' : 'Save'}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={cancelEdit}
                                                disabled={loading}
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    /* View Mode */
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-medium text-black dark:text-white truncate">
                                                {example.name}
                                            </h3>
                                            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                                                {example.description}
                                            </p>
                                            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">
                                                ID: {example.id} | Created: {new Date(example.createdAt).toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="flex gap-2 ml-4">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => startEdit(example)}
                                                disabled={loading}
                                            >
                                                Edit
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                onClick={() => handleDelete(example.id)}
                                                disabled={loading}
                                            >
                                                Delete
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Info Box */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h3 className="font-medium text-blue-800 dark:text-blue-300 mb-2">
                    Job & Event Integration
                </h3>
                <p className="text-sm text-blue-700 dark:text-blue-400">
                    When you create, update, or delete an example, events are emitted and background jobs are triggered.
                    Check your server console to see the job execution logs:
                </p>
                <ul className="mt-2 text-sm text-blue-600 dark:text-blue-400 list-disc list-inside space-y-1">
                    <li><code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded">onExampleCreated</code> - Triggered on create</li>
                    <li><code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded">onExampleUpdated</code> - Triggered on update</li>
                    <li><code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded">onExampleDeleted</code> - Triggered on delete</li>
                </ul>
            </div>
        </div>
    );
}
