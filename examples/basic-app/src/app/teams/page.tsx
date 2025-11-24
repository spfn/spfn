/**
 * Teams Page
 *
 * Demonstrates CRUD operations with SPFN API
 */

import { api } from '@/lib/api-client';
import TeamsClient from './teams-client';

export const metadata = {
    title: 'Teams - SPFN Example',
    description: 'Team management with CRUD operations',
};

export default async function TeamsPage()
{
    // Fetch initial teams data from server
    const { teams, total } = await api.listTeams.call();

    return (
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
            <main className="flex min-h-screen w-full max-w-5xl flex-col py-16 px-8 bg-white dark:bg-black">
                <div className="flex flex-col gap-8 w-full">
                    {/* Header */}
                    <div className="flex flex-col gap-2">
                        <h1 className="text-3xl font-bold text-black dark:text-zinc-50">
                            Team Management
                        </h1>
                        <p className="text-zinc-600 dark:text-zinc-400">
                            CRUD operations example using SPFN API
                        </p>
                    </div>

                    {/* Client Component */}
                    <TeamsClient initialTeams={teams} initialTotal={total} />

                    {/* Back to Home */}
                    <div className="mt-8">
                        <a
                            href="/"
                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            ← Back to Home
                        </a>
                    </div>
                </div>
            </main>
        </div>
    );
}