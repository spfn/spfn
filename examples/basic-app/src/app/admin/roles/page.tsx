/**
 * Admin Roles Page
 *
 * Superadmin role management test page
 */

import { getSession } from '@spfn/auth/nextjs/server';
import { redirect } from 'next/navigation';
import { RoleManager } from './_components/role-manager';

export default async function AdminRolesPage()
{
    const session = await getSession();

    if (!session)
    {
        redirect('/auth/login');
    }

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-black py-12 px-4">
            <div className="max-w-4xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-black dark:text-white">
                        Admin: Role Management
                    </h1>
                    <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                        Superadmin-only API test page.
                        Logged in as: {session.email} (role: {session.role})
                    </p>
                </div>

                <RoleManager />
            </div>
        </div>
    );
}
