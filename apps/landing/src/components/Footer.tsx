import Logo from '@/assets/icons/logo.svg';

export default function Footer()
{
    const navigation = {
        documentation: [
            { name: 'Getting Started', href: '#quick-start' },
            { name: 'Core API', href: 'https://github.com/spfn/spfn/blob/main/packages/core/README.md' },
            { name: 'CLI Guide', href: 'https://github.com/spfn/spfn/blob/main/packages/spfn/README.md' },
        ],
        community: [
            { name: 'GitHub', href: 'https://github.com/spfn/spfn' },
            { name: 'Discussions', href: 'https://github.com/spfn/spfn/discussions' },
            { name: 'Issues', href: 'https://github.com/spfn/spfn/issues' },
        ],
        ecosystem: [
            { name: '@spfn/core', href: 'https://npmjs.com/package/@spfn/core', status: '🚧 Alpha' },
            { name: 'spfn', href: 'https://npmjs.com/package/spfn', status: '🚧 Alpha' },
        ],
    };

    return (
        <footer className="bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800">
            <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8 lg:py-20">
                <div className="grid grid-cols-1 gap-12 lg:grid-cols-4 lg:gap-16">
                    {/* Brand */}
                    <div className="lg:col-span-1">
                        <div className="flex items-center gap-x-2">
                            <Logo className="size-10 text-gray-900 dark:text-white" />
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-white font-sansation">
                                Superfunction
                            </h3>
                        </div>
                        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                            Type-safe backend for Next.js
                        </p>
                        <a
                            href="https://github.com/spfn/spfn"
                            className="mt-8 inline-flex items-center gap-x-2 rounded-md bg-gray-900 dark:bg-white px-4 py-2 text-sm font-semibold text-white dark:text-gray-900 shadow-sm hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors"
                        >
                            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                            </svg>
                            Star on GitHub
                        </a>
                        <p className="mt-8 text-xs text-gray-500 dark:text-gray-500">
                            Built with ❤️ in Seoul
                            <br />
                            for the Next.js community
                        </p>
                    </div>

                    {/* Documentation */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                            Documentation
                        </h3>
                        <ul className="mt-4 space-y-3">
                            {navigation.documentation.map((item) => (
                                <li key={item.name}>
                                    <a
                                        href={item.href}
                                        className="text-sm text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors"
                                    >
                                        { item.name }
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Community */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                            Community
                        </h3>
                        <ul className="mt-4 space-y-3">
                            {navigation.community.map((item) => (
                                <li key={item.name}>
                                    <a
                                        href={item.href}
                                        className="text-sm text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors"
                                    >
                                        { item.name }
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Ecosystem */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                            Ecosystem
                        </h3>
                        <ul className="mt-4 space-y-3">
                            {navigation.ecosystem.map((item) => (
                                <li key={item.name}>
                                    <a
                                        href={item.href}
                                        className="text-sm text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors flex items-center gap-x-3"
                                    >
                                        <span>{ item.name }</span>
                                        <span className="text-xs text-gray-500 dark:text-gray-500">
                                            { item.status }
                                        </span>
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                <div className="mt-16 border-t border-gray-200 dark:border-gray-800 pt-10">
                    <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
                        <p className="text-xs text-gray-500 dark:text-gray-500">
                            © {new Date().getFullYear()} INFLIKE Inc. All rights reserved.
                        </p>
                        <div className="flex items-center gap-x-6">
                            <a
                                href="https://github.com/spfn/spfn/blob/main/LICENSE"
                                className="text-xs text-gray-500 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400 transition-colors"
                            >
                                MIT License
                            </a>
                        </div>
                    </div>

                    <div className="mt-10 flex items-center justify-center gap-x-6 text-xs text-gray-500 dark:text-gray-500">
                        <div className="flex items-center gap-x-2">
                            <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                            Node.js 18+
                        </div>
                        <div className="flex items-center gap-x-2">
                            <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                            Next.js 15+
                        </div>
                        <div className="flex items-center gap-x-2">
                            <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                            PostgreSQL
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
}