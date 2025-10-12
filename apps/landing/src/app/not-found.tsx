import Link from 'next/link';

export default function NotFound()
{
    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-950 flex items-center justify-center px-6">
            <div className="max-w-2xl text-center">
                <div className="mb-8">
                    <h1 className="text-9xl font-bold text-blue-600 dark:text-blue-400">
                        404
                    </h1>
                </div>

                <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl mb-4">
                    Page not found
                </h2>

                <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
                    Sorry, we couldn't find the page you're looking for.
                </p>

                <div className="flex items-center justify-center gap-x-6">
                    <Link
                        href="/"
                        className="rounded-md bg-blue-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-colors"
                    >
                        Go back home
                    </Link>
                    <a
                        href="https://github.com/spfn/spfn"
                        className="text-sm font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                        View on GitHub <span aria-hidden="true">→</span>
                    </a>
                </div>

                <div className="mt-12 pt-12 border-t border-gray-200 dark:border-gray-800">
                    <p className="text-sm text-gray-500 dark:text-gray-500">
                        Looking for documentation?
                    </p>
                    <div className="mt-4 flex items-center justify-center gap-x-6">
                        <a
                            href="https://github.com/spfn/spfn/tree/main/packages/core"
                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            Core API
                        </a>
                        <a
                            href="https://github.com/spfn/spfn/tree/main/packages/cli"
                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            CLI Guide
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}