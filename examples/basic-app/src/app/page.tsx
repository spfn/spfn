/**
 * Basic App - Home Page
 *
 * Demonstrates SPFN API integration with Next.js
 */

import { api } from '@/lib/api-client';

export default async function Home()
{
    // Fetch data from SPFN API through TypedProxy
    const health = await api.getHealth.call();
    const root = await api.getRoot.call();

    return (
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
            <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
                <div className="flex flex-col gap-8 w-full">
                    {/* SPFN Logo */}
                    <div className="flex items-center gap-3">
                        <div className="text-4xl font-bold">SPFN</div>
                        <div className="text-sm text-zinc-500">v{root.version}</div>
                    </div>

                    {/* API Info */}
                    <div className="flex flex-col gap-4">
                        <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
                            {root.name}
                        </h1>
                        <p className="text-lg text-zinc-600 dark:text-zinc-400">
                            {root.message}
                        </p>
                    </div>

                    {/* Health Status */}
                    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span className="font-medium">Status: {health.status}</span>
                        </div>
                        <div className="mt-2 text-sm text-zinc-500">
                            Uptime: {Math.floor(health.uptime)}s
                        </div>
                    </div>

                    {/* Available Endpoints */}
                    <div className="flex flex-col gap-3">
                        <h2 className="text-xl font-semibold">Available Endpoints</h2>
                        <div className="grid grid-cols-1 gap-2">
                            {Object.entries(root.endpoints).map(([name, path]) => (
                                <a
                                    key={name}
                                    href={String(path)}
                                    className="flex items-center gap-2 rounded-md border border-zinc-200 dark:border-zinc-800 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                                >
                                    <code className="text-sm font-mono text-blue-600 dark:text-blue-400">
                                        {String(path)}
                                    </code>
                                    <span className="text-sm text-zinc-500">- {name}</span>
                                </a>
                            ))}
                        </div>
                    </div>

                    {/* Links */}
                    <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
                        <a
                            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-black text-white dark:bg-white dark:text-black px-5 transition-colors hover:bg-zinc-800 dark:hover:bg-zinc-200 md:w-[200px]"
                            href="/examples"
                        >
                            View Examples
                        </a>
                        <a
                            className="flex h-12 w-full items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a] md:w-[200px]"
                            href="/teams"
                        >
                            View Teams
                        </a>
                    </div>
                </div>
            </main>
        </div>
    );
}