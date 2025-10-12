import CodeBlock from '@/components/CodeBlock';

export default function Features()
{
    const features = [
        {
            icon: '🎯',
            title: 'Contract-based API',
            items: [
                'Define once, validated everywhere',
                'Auto-generated TypeScript client',
                'OpenAPI compatible (coming soon)',
            ],
            code: `export const getUserContract = {
  method: 'GET',
  path: '/:id',
  params: Type.Object({
    id: Type.String()
  }),
  response: Type.Object({
    id: Type.Number(),
    name: Type.String()
  })
};`,
        },
        {
            icon: '🗄️',
            title: 'Type-safe Database',
            items: [
                'Drizzle ORM with Repository pattern',
                'Automatic pagination & filtering',
                'Transaction support (AsyncLocalStorage)',
            ],
            code: `const userRepo = new Repository(db, users);

// Type-safe queries
const user = await userRepo.findById(123);
const list = await userRepo.findMany({
  limit: 10,
  offset: 0
});`,
        },
        {
            icon: '⚡',
            title: 'Always-on Runtime',
            items: [
                'Connection pooling (PostgreSQL, Redis)',
                'Background workers',
                'WebSocket support',
            ],
            code: `// Long-running process
const db = getDb('write');
const redis = getRedis();

// Runs independently
setInterval(async () => {
  await processJobs();
}, 1000);`,
        },
        {
            icon: '📁',
            title: 'File-based Routing',
            items: [
                'users/index.ts → GET /users',
                'users/[id].ts → GET /users/:id',
                'Auto-discovery & registration',
            ],
            code: `// src/server/routes/users/[id]/index.ts
export const GET = bind(
  getUserContract,
  async (c) => {
    const user = await repo
      .findById(c.params.id);
    return c.json(user);
  }
);`,
        },
    ];

    return (
        <section id="features" className="py-24 sm:py-32 bg-white dark:bg-gray-950">
            <div className="mx-auto max-w-7xl px-6 lg:px-8">
                <div className="mx-auto max-w-2xl lg:text-center">
                    <h2 className="text-base font-semibold leading-7 text-blue-600 dark:text-blue-400">
                        Core Features
                    </h2>
                    <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
                        Everything you need for production
                    </p>
                    <p className="mt-6 text-lg leading-8 text-gray-600 dark:text-gray-400">
                        Built-in features that scale from MVP to enterprise
                    </p>
                </div>

                <div className="mx-auto mt-16 max-w-7xl">
                    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                        {features.map((feature) => (
                            <div
                                key={feature.title}
                                className="relative rounded-2xl bg-gray-50 dark:bg-gray-900 p-8 ring-1 ring-gray-200 dark:ring-gray-800"
                            >
                                <div className="flex items-start gap-x-4">
                                    <div className="text-4xl">{ feature.icon }</div>
                                    <div className="flex-1">
                                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                                            { feature.title }
                                        </h3>
                                        <ul className="mt-4 space-y-2">
                                            {feature.items.map((item) => (
                                                <li
                                                    key={item}
                                                    className="flex items-start gap-x-2 text-sm text-gray-600 dark:text-gray-400"
                                                >
                                                    <svg
                                                        className="mt-0.5 h-5 w-5 flex-none text-blue-600 dark:text-blue-400"
                                                        viewBox="0 0 20 20"
                                                        fill="currentColor"
                                                    >
                                                        <path
                                                            fillRule="evenodd"
                                                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                                                            clipRule="evenodd"
                                                        />
                                                    </svg>
                                                    { item }
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>

                                <CodeBlock code={feature.code} language="typescript" variant="card" className="mt-6" />
                            </div>
                        ))}
                    </div>

                    <div className="mt-12 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 p-8 text-center">
                        <h3 className="text-2xl font-bold text-white">
                            🔄 Watch Mode (Dev only)
                        </h3>
                        <p className="mt-4 text-lg text-blue-50">
                            Contract changes → Auto-regenerate client
                        </p>
                        <p className="mt-2 text-sm text-blue-100">
                            No manual sync needed • Hot reload for both frontend & backend
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}