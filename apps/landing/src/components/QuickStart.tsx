import CodeBlock from '@/components/CodeBlock';

export default function QuickStart()
{
    const steps = [
        {
            number: '1',
            title: 'Install',
            code: `cd your-nextjs-project
npx spfn@alpha init`,
            language: 'bash',
            description: 'Initialize SPFN in your existing Next.js project',
        },
        {
            number: '2',
            title: 'Start dev server',
            code: `npm run spfn:dev`,
            language: 'bash',
            result: `✅ Backend: http://localhost:8790
✅ Frontend: http://localhost:3790`,
            description: 'Run both backend and frontend servers',
        },
        {
            number: '3',
            title: 'Generate boilerplate',
            code: `npx spfn@alpha generate users`,
            language: 'bash',
            created: [
                'Entity template (entities/users.ts)',
                'Type-safe REST API (5 CRUD endpoints)',
                'Repository with pagination',
                'Auto-generated client for Next.js',
            ],
            description: 'The magic ✨',
        },
        {
            number: '4',
            title: 'Use in Next.js',
            code: `// app/page.tsx
import { api } from '@/lib/api'

export default async function Page() {
  const users = await api.users.list()
  const user = await api.users.getById({
    params: { id: '123' }
  })

  return <div>{user.name}</div>
  //           ^ Fully typed!
}`,
            language: 'typescript',
            description: 'Ready to use!',
        },
    ];

    return (
        <section id="quick-start" className="py-24 sm:py-32 bg-gray-50 dark:bg-gray-900">
            <div className="mx-auto max-w-7xl px-6 lg:px-8">
                <div className="mx-auto max-w-2xl lg:text-center">
                    <h2 className="text-base font-semibold leading-7 text-blue-600 dark:text-blue-400">
                        Quick Start
                    </h2>
                    <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
                        Get started in 5 minutes
                    </p>
                    <p className="mt-6 text-lg leading-8 text-gray-600 dark:text-gray-400">
                        From zero to a fully functional backend with type-safe APIs
                    </p>
                </div>

                <div className="mx-auto mt-16 max-w-4xl">
                    <div className="space-y-8">
                        {steps.map((step) => (
                            <div
                                key={step.number}
                                className="relative rounded-2xl bg-white dark:bg-gray-950 p-6 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800"
                            >
                                <div className="flex items-start gap-x-4">
                                    <div className="flex-none">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-lg">
                                            { step.number }
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-lg font-semibold leading-7 text-gray-900 dark:text-white">
                                            { step.title }
                                            {step.description && (
                                                <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                                                    { step.description }
                                                </span>
                                            )}
                                        </h3>

                                        <CodeBlock code={step.code} language={step.language} className="mt-4" />

                                        {step.result && (
                                            <div className="mt-3 rounded-lg bg-green-50 dark:bg-green-950/20 p-3 font-mono text-sm">
                                                <pre className="text-green-700 dark:text-green-400 whitespace-pre">
                                                    { step.result }
                                                </pre>
                                            </div>
                                        )}

                                        {step.created && (
                                            <div className="mt-4 space-y-2">
                                                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                                    Done! You just created:
                                                </p>
                                                <ul className="space-y-1">
                                                    {step.created.map((item) => (
                                                        <li
                                                            key={item}
                                                            className="flex items-center gap-x-2 text-sm text-gray-600 dark:text-gray-400"
                                                        >
                                                            <svg
                                                                className="h-5 w-5 text-green-500"
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
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-10 rounded-2xl bg-blue-50 dark:bg-blue-950/20 p-6 ring-1 ring-blue-100 dark:ring-blue-900">
                        <h4 className="text-base font-semibold text-gray-900 dark:text-white">
                            Next: Customize your entity
                        </h4>
                        <CodeBlock
                            code={`# Edit entities/users.ts - Add fields (email, name, etc.)
# Then migrate:
npx spfn@alpha db generate
npx spfn@alpha db migrate`}
                            language="bash"
                            className="mt-4"
                        />
                    </div>
                </div>
            </div>
        </section>
    );
}
