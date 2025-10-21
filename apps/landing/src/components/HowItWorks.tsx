import CodeBlock from '@/components/CodeBlock';

export default function HowItWorks()
{
    const steps = [
        {
            number: '1',
            title: 'Define Contract',
            subtitle: 'src/server/routes/users/contract.ts',
            description: 'Define your API shape once with full type safety',
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
            number: '2',
            title: 'Implement Route',
            subtitle: 'src/server/routes/users/[id]/index.ts',
            description: 'Bind contract to handler with automatic validation',
            code: `import { bind } from '@spfn/core';

export const GET = bind(
  getUserContract,
  async (c) => {
    const user = await repo
      .findById(c.params.id);
    return c.json(user);
  }
);`,
        },
        {
            number: '3',
            title: 'Use in Next.js',
            subtitle: 'Auto-generated src/lib/api.ts',
            description: 'Type-safe client generated automatically - no manual sync!',
            code: `import { api } from '@/lib/api'

const user = await api.users.getById({
  params: { id: '123' }
});
//    ^ Fully typed!
//    No manual sync needed`,
        },
    ];

    return (
        <section className="py-24 sm:py-32 bg-gradient-to-b from-white to-blue-50 dark:from-gray-950 dark:to-gray-900">
            <div className="mx-auto max-w-7xl px-6 lg:px-8">
                <div className="mx-auto max-w-2xl lg:text-center">
                    <h2 className="typo-base font-semibold leading-7 text-blue-600 dark:text-blue-400">
                        How It Works
                    </h2>
                    <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
                        End-to-end type safety
                    </p>
                    <p className="mt-6 text-lg leading-8 text-gray-600 dark:text-gray-400">
                        From contract definition to frontend usage - fully typed at every step
                    </p>
                </div>

                <div className="mx-auto mt-16 max-w-5xl">
                    <div className="relative">
                        {steps.map((step, index) => (
                            <div key={step.number}>
                                <div className="relative rounded-2xl bg-white dark:bg-gray-900 p-8 shadow-lg ring-1 ring-gray-200 dark:ring-gray-800">
                                    <div className="flex items-start gap-x-6">
                                        <div className="flex-none">
                                            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-white font-bold text-xl shadow-lg">
                                                { step.number }
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                                                { step.title }
                                            </h3>
                                            <p className="mt-1 text-sm font-mono text-blue-600 dark:text-blue-400">
                                                { step.subtitle }
                                            </p>
                                            <p className="mt-3 typo-base text-gray-600 dark:text-gray-400">
                                                { step.description }
                                            </p>

                                            <CodeBlock code={step.code} language="typescript" variant="card" className="mt-6" />
                                        </div>
                                    </div>
                                </div>

                                {index < steps.length - 1 && (
                                    <div className="flex justify-center my-6">
                                        <div className="flex flex-col items-center">
                                            <div className="text-3xl text-blue-600 dark:text-blue-400">↓</div>
                                            <div className="mt-2 rounded-full bg-blue-100 dark:bg-blue-900/30 px-4 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300">
                                                Auto-sync
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="mt-12 rounded-2xl bg-gradient-to-br from-green-50 to-blue-50 dark:from-green-950/20 dark:to-blue-950/20 p-8 text-center ring-1 ring-green-200 dark:ring-green-900/50">
                        <div className="text-4xl mb-4">✨</div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                            Magic: Compile-time Type Safety
                        </h3>
                        <p className="mt-3 typo-base text-gray-700 dark:text-gray-300">
                            Change the contract? TypeScript immediately shows errors in your frontend code.
                        </p>
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                            No runtime surprises. No manual API documentation. Just pure type safety.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}