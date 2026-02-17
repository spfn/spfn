'use client';

/**
 * Role Manager Component
 *
 * Client component for testing admin role CRUD and user role assignment
 */

import { useState, useEffect, useCallback } from 'react';
import { authApi } from '@spfn/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Role
{
    id: number;
    name: string;
    displayName: string;
    description: string | null;
    priority: number;
    isSystem: boolean;
    isBuiltin: boolean;
    isActive: boolean;
}

export function RoleManager()
{
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Create form
    const [newName, setNewName] = useState('');
    const [newDisplayName, setNewDisplayName] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [newPriority, setNewPriority] = useState('10');

    // Edit state
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editDisplayName, setEditDisplayName] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editPriority, setEditPriority] = useState('');

    // User role assignment
    const [assignUserId, setAssignUserId] = useState('');
    const [assignRoleId, setAssignRoleId] = useState('');

    const showSuccess = (msg: string) =>
    {
        setSuccess(msg);
        setTimeout(() => setSuccess(null), 3000);
    };

    const fetchRoles = useCallback(async () =>
    {
        setLoading(true);
        setError(null);
        try
        {
            const data = await authApi.listRoles.call({
                query: { includeInactive: true },
            });
            setRoles(data.roles as Role[]);
        }
        catch (err)
        {
            setError(err instanceof Error ? err.message : 'Failed to fetch roles');
        }
        finally
        {
            setLoading(false);
        }
    }, []);

    useEffect(() =>
    {
        fetchRoles();
    }, [fetchRoles]);

    const handleCreate = async (e: React.FormEvent) =>
    {
        e.preventDefault();
        if (!newName.trim() || !newDisplayName.trim()) return;

        setLoading(true);
        setError(null);
        try
        {
            await authApi.createAdminRole.call({
                body: {
                    name: newName,
                    displayName: newDisplayName,
                    description: newDescription || undefined,
                    priority: Number(newPriority) || 10,
                },
            });
            setNewName('');
            setNewDisplayName('');
            setNewDescription('');
            setNewPriority('10');
            showSuccess(`Role "${newDisplayName}" created`);
            await fetchRoles();
        }
        catch (err)
        {
            setError(err instanceof Error ? err.message : 'Failed to create role');
        }
        finally
        {
            setLoading(false);
        }
    };

    const handleUpdate = async (id: number) =>
    {
        if (!editDisplayName.trim()) return;

        setLoading(true);
        setError(null);
        try
        {
            await authApi.updateAdminRole.call({
                params: { id },
                body: {
                    displayName: editDisplayName,
                    description: editDescription || undefined,
                    priority: Number(editPriority) || undefined,
                },
            });
            setEditingId(null);
            showSuccess('Role updated');
            await fetchRoles();
        }
        catch (err)
        {
            setError(err instanceof Error ? err.message : 'Failed to update role');
        }
        finally
        {
            setLoading(false);
        }
    };

    const handleDelete = async (role: Role) =>
    {
        if (!confirm(`Delete role "${role.displayName}"?`)) return;

        setLoading(true);
        setError(null);
        try
        {
            await authApi.deleteAdminRole.call({ params: { id: role.id } });
            showSuccess(`Role "${role.displayName}" deleted`);
            await fetchRoles();
        }
        catch (err)
        {
            setError(err instanceof Error ? err.message : 'Failed to delete role');
        }
        finally
        {
            setLoading(false);
        }
    };

    const handleAssignRole = async (e: React.FormEvent) =>
    {
        e.preventDefault();
        if (!assignUserId.trim() || !assignRoleId.trim()) return;

        setLoading(true);
        setError(null);
        try
        {
            await authApi.updateUserRole.call({
                params: { userId: Number(assignUserId) },
                body: { roleId: Number(assignRoleId) },
            });
            showSuccess(`User #${assignUserId} assigned to role #${assignRoleId}`);
            setAssignUserId('');
            setAssignRoleId('');
        }
        catch (err)
        {
            setError(err instanceof Error ? err.message : 'Failed to assign role');
        }
        finally
        {
            setLoading(false);
        }
    };

    const startEdit = (role: Role) =>
    {
        setEditingId(role.id);
        setEditDisplayName(role.displayName);
        setEditDescription(role.description || '');
        setEditPriority(String(role.priority));
    };

    return (
        <div className="space-y-6">
            {/* Success Message */}
            {success && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-green-600 dark:text-green-400">
                    {success}
                </div>
            )}

            {/* Error Message */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-600 dark:text-red-400">
                    {error}
                </div>
            )}

            {/* Create Role Form */}
            <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6">
                <h2 className="text-lg font-semibold mb-4 text-black dark:text-white">
                    Create Role
                </h2>
                <form onSubmit={handleCreate} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                            placeholder="name (slug, e.g. content-editor)"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            disabled={loading}
                        />
                        <Input
                            placeholder="Display Name"
                            value={newDisplayName}
                            onChange={(e) => setNewDisplayName(e.target.value)}
                            disabled={loading}
                        />
                        <Input
                            placeholder="Description (optional)"
                            value={newDescription}
                            onChange={(e) => setNewDescription(e.target.value)}
                            disabled={loading}
                        />
                        <Input
                            placeholder="Priority (default: 10)"
                            type="number"
                            value={newPriority}
                            onChange={(e) => setNewPriority(e.target.value)}
                            disabled={loading}
                        />
                    </div>
                    <Button type="submit" disabled={loading || !newName.trim() || !newDisplayName.trim()}>
                        {loading ? 'Creating...' : 'Create Role'}
                    </Button>
                </form>
            </div>

            {/* Roles List */}
            <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-black dark:text-white">
                        Roles ({roles.length})
                    </h2>
                    <Button variant="outline" size="sm" onClick={fetchRoles} disabled={loading}>
                        {loading ? 'Loading...' : 'Refresh'}
                    </Button>
                </div>

                {roles.length === 0 ? (
                    <div className="p-6 text-center text-zinc-500">
                        {loading ? 'Loading roles...' : 'No roles found'}
                    </div>
                ) : (
                    <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                        {roles.map((role) => (
                            <li key={role.id} className="p-4">
                                {editingId === role.id ? (
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            <Input
                                                value={editDisplayName}
                                                onChange={(e) => setEditDisplayName(e.target.value)}
                                                placeholder="Display Name"
                                                disabled={loading}
                                            />
                                            <Input
                                                value={editDescription}
                                                onChange={(e) => setEditDescription(e.target.value)}
                                                placeholder="Description"
                                                disabled={loading}
                                            />
                                            <Input
                                                value={editPriority}
                                                onChange={(e) => setEditPriority(e.target.value)}
                                                placeholder="Priority"
                                                type="number"
                                                disabled={loading}
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <Button size="sm" onClick={() => handleUpdate(role.id)} disabled={loading}>
                                                {loading ? 'Saving...' : 'Save'}
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => setEditingId(null)} disabled={loading}>
                                                Cancel
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-medium text-black dark:text-white">
                                                    {role.displayName}
                                                </h3>
                                                <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                                                    {role.name}
                                                </code>
                                                {role.isBuiltin && (
                                                    <span className="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
                                                        builtin
                                                    </span>
                                                )}
                                                {role.isSystem && (
                                                    <span className="text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded">
                                                        system
                                                    </span>
                                                )}
                                                {!role.isActive && (
                                                    <span className="text-xs bg-zinc-200 dark:bg-zinc-700 text-zinc-500 px-1.5 py-0.5 rounded">
                                                        inactive
                                                    </span>
                                                )}
                                            </div>
                                            {role.description && (
                                                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                                                    {role.description}
                                                </p>
                                            )}
                                            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">
                                                ID: {role.id} | Priority: {role.priority}
                                            </p>
                                        </div>
                                        <div className="flex gap-2 ml-4">
                                            <Button size="sm" variant="outline" onClick={() => startEdit(role)} disabled={loading}>
                                                Edit
                                            </Button>
                                            {!role.isBuiltin && !role.isSystem && (
                                                <Button size="sm" variant="destructive" onClick={() => handleDelete(role)} disabled={loading}>
                                                    Delete
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* User Role Assignment */}
            <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6">
                <h2 className="text-lg font-semibold mb-4 text-black dark:text-white">
                    Assign User Role
                </h2>
                <form onSubmit={handleAssignRole} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                            placeholder="User ID"
                            type="number"
                            value={assignUserId}
                            onChange={(e) => setAssignUserId(e.target.value)}
                            disabled={loading}
                        />
                        <div>
                            <select
                                className="w-full h-10 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm"
                                value={assignRoleId}
                                onChange={(e) => setAssignRoleId(e.target.value)}
                                disabled={loading}
                            >
                                <option value="">Select Role</option>
                                {roles.map((role) => (
                                    <option key={role.id} value={role.id}>
                                        {role.displayName} (ID: {role.id})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <Button type="submit" disabled={loading || !assignUserId.trim() || !assignRoleId.trim()}>
                        {loading ? 'Assigning...' : 'Assign Role'}
                    </Button>
                </form>
            </div>
        </div>
    );
}
