import CodeBlock from '@/components/CodeBlock';

export default function QuickStart()
{
    const setupOptions = [
        {
            badge: 'Recommended',
            title: 'Option 1: Create New Project', code: `# Create new project with SPFN + Next.js + TypeScript + Tailwind
npx spfn@alpha create my-app
cd my-app

# Start databases (Docker recommended, or use your own PostgreSQL)
docker compose up -d

# Copy environment variables
cp .env.local.example .env.local

# Start dev server
npm run spfn:dev`,
            language: 'bash',
            description: 'Everything configured out of the box',
        },
        {
            badge: null,
            title: 'Option 2: Add to Existing Next.js Project',
            code: `cd your-nextjs-project
npx spfn@alpha init

# Start databases
docker compose up -d

# Copy environment variables
cp .env.local.example .env.local

# Start dev server
npm run spfn:dev`,
            language: 'bash',
            description: 'Add SPFN backend to existing Next.js app',
        },
    ];

    const steps = [
        {
            number: '1',
            title: 'What You Get',
            code: `src/server/
  routes/
    examples/       # Example routes
      contract.ts   # API contracts
      index.ts      # GET /examples
  entities/         # Database schemas
    examples.ts
  drizzle.config.ts

src/lib/
  api.ts           # Auto-generated type-safe client`,
            language: 'bash',
            created: [
                'File-based routing with auto-discovery',
                'Example routes with contracts',
                'Database entities and migrations',
                'Auto-generated client for Next.js',
            ],
            description: 'Out of the box',
        },
        {
            number: '2',
            title: 'Create Your First Route',
            code: `# Example route structure
src/server/routes/
  users/
    contract.ts    # Define API contract
    index.ts       # GET /users
    [id]/
      index.ts     # GET /users/:id`,
            language: 'bash',
            description: 'File-based routing',
        },
        {
            number: '3',
            title: 'Define Database Schema',
            code: `# Create/edit entity
src/server/entities/users.ts

# Generate migration
npx spfn@alpha db generate

# Apply migration
npx spfn@alpha db migrate`,
            language: 'bash',
            description: 'Type-safe database',
        },
        {
            number: '4',
            title: 'Use in Next.js',
            code: `// app/page.tsx
import { api } from '@/lib/api'

export default async function Page() {
  const examples = await api.examples.list()

  return <div>{examples.length} examples</div>
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
                    <h2 className="typo-base font-semibold leading-7 text-blue-600 dark:text-blue-400">
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
                    {/* Setup Options */}
                    <div className="mb-12 grid gap-6 lg:grid-cols-2">
                        {setupOptions.map((option, index) => (
                            <div
                                key={index}
                                className="relative rounded-2xl bg-white dark:bg-gray-950 p-6 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800"
                            >
                                {option.badge && (
                                    <div className="absolute -top-3 left-6">
                                        <span className="inline-flex items-center rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
                                            {option.badge}
                                        </span>
                                    </div>
                                )}
                                <h3 className="text-lg font-semibold leading-7 text-gray-900 dark:text-white">
                                    {option.title}
                                </h3>
                                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                    {option.description}
                                </p>
                                <CodeBlock code={option.code} language={option.language} className="mt-4" />
                            </div>
                        ))}
                    </div>

                    {/* Development Workflow Steps */}
                    <div className="mb-8">
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white text-center">
                            Then follow these steps:
                        </h3>
                    </div>

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
                        <h4 className="typo-base font-semibold text-gray-900 dark:text-white">
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

                    {/* Production Deployment */}
                    <div className="mt-10 rounded-2xl bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 p-8 ring-1 ring-purple-100 dark:ring-purple-900">
                        <div className="flex items-center gap-x-3 mb-4">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-600 text-white font-bold text-xl">
                                🚀
                            </div>
                            <h4 className="text-xl font-semibold text-gray-900 dark:text-white">
                                Ready for Production?
                            </h4>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 mb-6">
                            <span className="font-sansation font-semibold italic">SPFN</span> includes production-ready Docker setup and comprehensive deployment guides in the <code className="text-purple-600 dark:text-purple-400">.guide/</code> directory.
                        </p>
                        <div className="space-y-4">
                            <div>
                                <h5 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                                    Build for production:
                                </h5>
                                <CodeBlock
                                    code={`npm run spfn:build
npm run spfn:start`}
                                    language="bash"
                                    className="mt-2"
                                />
                            </div>
                            <div>
                                <h5 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                                    Or deploy with Docker:
                                </h5>
                                <CodeBlock
                                    code={`docker compose -f docker-compose.production.yml up --build -d`}
                                    language="bash"
                                    className="mt-2"
                                />
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400 pt-2">
                                📖 See <code className="text-purple-600 dark:text-purple-400">.guide/deployment.md</code> for complete deployment guide (VPS, Railway, Render, Vercel hybrid, and more)
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
