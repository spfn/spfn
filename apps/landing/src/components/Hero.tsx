import CodeBlock from '@/components/CodeBlock';

export default function Hero()
{
    const terminalCode = `# Create Next.js project (App Router + src/ recommended)
$ npx create-next-app@latest --typescript --app --src-dir

# Initialize SPFN
$ npx spfn@alpha init

# Generate boilerplate
$ npx spfn@alpha generate users

# Start dev server
$ npm run spfn:dev

✅ Backend: http://localhost:8790
✅ Frontend: http://localhost:3790`;

    return (
        <section className="relative overflow-hidden bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-950 py-20 sm:py-32">
            <div className="mx-auto max-w-7xl px-6 lg:px-8">
                <div className="mx-auto max-w-2xl text-center">
                    <div className="mb-8 flex justify-center">
                        <div className="relative rounded-lg px-4 py-2.5 text-sm leading-6 bg-amber-50 dark:bg-amber-950/20 border-2 border-amber-200 dark:border-amber-900 shadow-sm">
                            <div className="flex items-center gap-x-2">
                                <span className="text-lg">⚠️</span>
                                <span className="font-semibold text-amber-900 dark:text-amber-300">
                                    Alpha Release
                                </span>
                                <span className="text-amber-700 dark:text-amber-400">
                                    — APIs may change
                                </span>
                            </div>
                        </div>
                    </div>

                    <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-6xl">
                        Type-safe backend for{' '}
                        <span className="text-blue-600 dark:text-blue-400">Next.js</span>
                    </h1>

                    <p className="mt-6 text-lg leading-8 text-gray-600 dark:text-gray-300">
                        Next.js handles your frontend. <strong>SPFN</strong> handles your backend.
                    </p>

                    <p className="mt-4 text-base leading-7 text-gray-500 dark:text-gray-400">
                        Build scalable applications with type-safe APIs, connection pooling, background jobs, and end-to-end type safety.
                    </p>

                    <div className="mt-10 flex items-center justify-center gap-x-6">
                        <a
                            href="#quick-start"
                            className="rounded-md bg-blue-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-colors"
                        >
                            Get started
                        </a>
                        <a
                            href="https://github.com/spfn/spfn"
                            className="text-sm font-semibold leading-6 text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                            View on GitHub <span aria-hidden="true">→</span>
                        </a>
                    </div>

                    <div className="mt-10 flex items-center justify-center gap-x-6">
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                            Node.js 18+
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                            Next.js 15+ <span className="text-xs">(App Router)</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                            TypeScript 5.3+
                        </div>
                    </div>
                </div>

                <div className="mt-16 flow-root sm:mt-24">
                    <div className="relative rounded-xl bg-gray-900 p-2 ring-1 ring-white/10">
                        <div className="rounded-lg bg-gray-950 shadow-2xl">
                            <div className="flex items-center gap-x-4 border-b border-gray-800 px-4 py-3">
                                <div className="flex gap-x-1.5">
                                    <div className="h-3 w-3 rounded-full bg-red-500"></div>
                                    <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
                                    <div className="h-3 w-3 rounded-full bg-green-500"></div>
                                </div>
                                <span className="text-xs text-gray-500">Terminal</span>
                            </div>
                            <CodeBlock code={terminalCode} language="bash" className="rounded-none" />
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}