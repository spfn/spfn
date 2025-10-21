export default function WhenYouNeed()
{
    const useCases = [
        {
            emoji: '🚀',
            title: 'Building a mobile app?',
            description: 'Next.js (landing page) + SPFN (API) = Complete solution',
        },
        {
            emoji: '💼',
            title: 'Building a SaaS product?',
            description: 'Next.js (marketing + dashboard) + SPFN (backend) = Full-stack',
        },
        {
            emoji: '🎮',
            title: 'Need real-time features?',
            description: 'Chat, live notifications, collaborative editing → WebSocket + persistent connections',
        },
        {
            emoji: '⏱️',
            title: 'Need background jobs?',
            description: 'Email campaigns, report generation, data sync → Cron jobs + task queues',
        },
    ];

    const features = [
        'Complex business logic with transactions',
        'Connection pools (PostgreSQL, Redis)',
        'Background jobs & scheduled tasks',
        'End-to-end type safety (Contract → Client)',
    ];

    return (
        <section className="py-24 sm:py-32 bg-white dark:bg-gray-950">
            <div className="mx-auto max-w-7xl px-6 lg:px-8">
                <div className="mx-auto max-w-2xl lg:text-center">
                    <h2 className="typo-base font-semibold leading-7 text-blue-600 dark:text-blue-400">
                        When You Need <span className="font-sansation font-semibold italic">SPFN</span>
                    </h2>
                    <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
                        Perfect for ambitious projects
                    </p>
                </div>

                <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-5xl">
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        {useCases.map((useCase) => (
                            <div
                                key={useCase.title}
                                className="relative rounded-2xl bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 p-8 shadow-sm ring-1 ring-blue-100 dark:ring-blue-900/50 hover:shadow-md transition-shadow"
                            >
                                <div className="flex items-start gap-x-4">
                                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800">
                                        <span className="text-3xl">{ useCase.emoji }</span>
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                                            { useCase.title }
                                        </h3>
                                        <p className="typo-base leading-7 text-gray-700 dark:text-gray-300">
                                            { useCase.description }
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mx-auto mt-16 max-w-2xl">
                    <div className="rounded-2xl bg-blue-50 dark:bg-blue-950/20 p-8 ring-1 ring-blue-100 dark:ring-blue-900">
                        <h3 className="text-lg font-semibold leading-8 text-gray-900 dark:text-white mb-4">
                            🎯 Need these features?
                        </h3>
                        <ul className="space-y-3">
                            {features.map((feature) => (
                                <li key={feature} className="flex items-start gap-x-3">
                                    <svg
                                        className="h-6 w-5 flex-none text-blue-600 dark:text-blue-400"
                                        viewBox="0 0 20 20"
                                        fill="currentColor"
                                    >
                                        <path
                                            fillRule="evenodd"
                                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                                            clipRule="evenodd"
                                        />
                                    </svg>
                                    <span className="text-sm leading-6 text-gray-700 dark:text-gray-300">
                                        { feature }
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="mt-8 text-center">
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            If you just need simple API routes, Next.js is enough.
                        </p>
                        <p className="mt-2 typo-base font-semibold text-gray-900 dark:text-white">
                            If you need a real backend, Next.js + <span className="font-sansation font-semibold italic">SPFN</span>.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}