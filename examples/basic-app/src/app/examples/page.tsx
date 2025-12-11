/**
 * Examples CRUD Page
 *
 * Demonstrates Job & Event system with real-time CRUD operations
 */

import { api } from '@/lib/api-client';
import { ExampleList } from './_components/example-list';

export default async function ExamplesPage()
{
    const data = await api.listExamples.call({ query: { limit: 50 } });

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-black py-12 px-4">
            <div className="max-w-4xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-black dark:text-white">
                        Examples
                    </h1>
                    <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                        CRUD operations with Job & Event system integration.
                        Check server logs to see background jobs executing.
                    </p>
                </div>

                <ExampleList initialData={data} />
            </div>
        </div>
    );
}
