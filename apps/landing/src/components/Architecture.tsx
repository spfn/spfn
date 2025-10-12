export default function Architecture()
{
    return (
        <section className="py-24 sm:py-32 bg-gray-50 dark:bg-gray-900">
            <div className="mx-auto max-w-7xl px-6 lg:px-8">
                <div className="mx-auto max-w-2xl lg:text-center">
                    <h2 className="text-base font-semibold leading-7 text-blue-600 dark:text-blue-400">
                        Architecture
                    </h2>
                    <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
                        Clean separation of concerns
                    </p>
                    <p className="mt-6 text-lg leading-8 text-gray-600 dark:text-gray-400">
                        Frontend and backend run as separate processes with type-safe communication
                    </p>
                </div>

                <div className="mx-auto mt-16 max-w-4xl">
                    <div className="rounded-2xl bg-white dark:bg-gray-950 p-8 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800">
                        <div className="space-y-6 font-mono text-sm">
                            {/* Next.js Layer */}
                            <div className="rounded-lg bg-green-50 dark:bg-green-950/20 p-6 ring-1 ring-green-200 dark:ring-green-900">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-lg font-bold text-green-900 dark:text-green-300">
                                            Next.js
                                        </h3>
                                        <ul className="mt-2 space-y-1 text-xs text-green-700 dark:text-green-400">
                                            <li>• Landing page</li>
                                            <li>• Marketing site</li>
                                            <li>• Dashboard</li>
                                        </ul>
                                    </div>
                                    <div className="rounded-md bg-green-100 dark:bg-green-900/30 px-3 py-1 text-xs font-semibold text-green-700 dark:text-green-300">
                                        Port 3790
                                    </div>
                                </div>
                            </div>

                            {/* Arrow */}
                            <div className="flex flex-col items-center">
                                <div className="text-2xl">↓</div>
                                <div className="mt-2 rounded-full bg-blue-100 dark:bg-blue-900/30 px-4 py-2 text-center text-xs font-semibold text-blue-700 dark:text-blue-300">
                                    Type-safe API calls
                                </div>
                                <div className="mt-2 text-2xl">↓</div>
                            </div>

                            {/* SPFN Backend Layer */}
                            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-6 ring-1 ring-blue-200 dark:ring-blue-900">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-lg font-bold text-blue-900 dark:text-blue-300">
                                            SPFN Backend
                                        </h3>
                                        <ul className="mt-2 space-y-1 text-xs text-blue-700 dark:text-blue-400">
                                            <li>• REST API</li>
                                            <li>• Business logic</li>
                                            <li>• Transactions</li>
                                        </ul>
                                    </div>
                                    <div className="rounded-md bg-blue-100 dark:bg-blue-900/30 px-3 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300">
                                        Port 8790
                                    </div>
                                </div>
                            </div>

                            {/* Arrow */}
                            <div className="flex justify-center">
                                <div className="text-2xl">↓</div>
                            </div>

                            {/* Database Layer */}
                            <div className="rounded-lg bg-purple-50 dark:bg-purple-950/20 p-6 ring-1 ring-purple-200 dark:ring-purple-900">
                                <h3 className="text-lg font-bold text-purple-900 dark:text-purple-300 text-center">
                                    PostgreSQL / Redis / etc.
                                </h3>
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="rounded-lg bg-white dark:bg-gray-950 p-6 ring-1 ring-gray-200 dark:ring-gray-800">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                                ✅ Benefits
                            </h4>
                            <ul className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                                <li>• Separate deployment & scaling</li>
                                <li>• Independent development</li>
                                <li>• Reuse backend for mobile apps</li>
                                <li>• Better resource management</li>
                            </ul>
                        </div>

                        <div className="rounded-lg bg-white dark:bg-gray-950 p-6 ring-1 ring-gray-200 dark:ring-gray-800">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                                🔗 Type Safety
                            </h4>
                            <ul className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                                <li>• Contract defines API shape</li>
                                <li>• Auto-generated client</li>
                                <li>• Compile-time errors</li>
                                <li>• No manual synchronization</li>
                            </ul>
                        </div>
                    </div>

                    <div className="mt-12 text-center">
                        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                            Ready to build?
                        </h3>
                        <p className="text-base text-gray-600 dark:text-gray-400 mb-6">
                            Get started with SPFN in your Next.js project
                        </p>
                        <a
                            href="#quick-start"
                            className="inline-flex items-center rounded-md bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-colors"
                        >
                            Get Started
                        </a>
                    </div>
                </div>
            </div>
        </section>
    );
}