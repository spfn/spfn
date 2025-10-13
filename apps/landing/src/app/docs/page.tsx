import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Documentation - SPFN',
  description: 'Type-safe backend framework for Next.js. Build scalable APIs with contract-based routing, automatic client generation, Drizzle ORM, transactions, and end-to-end type safety.',
};

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-4xl font-bold mb-4">SPFN Documentation</h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 mb-12">
          Type-safe backend framework for Next.js
        </p>

        <div className="prose dark:prose-invert max-w-none">
          <h2 className="text-2xl font-semibold mb-4">What is SPFN?</h2>
          <p className="mb-6">
            SPFN (Superfunction) is a type-safe backend framework for Next.js that provides
            contract-based routing, automatic client generation, database management with
            Drizzle ORM, connection pooling, and full transaction support.
          </p>

          <h2 className="text-2xl font-semibold mb-4">Key Features</h2>
          <ul className="list-disc pl-6 mb-8 space-y-2">
            <li><strong>Contract-based routing:</strong> Define API contracts with TypeScript and automatic validation</li>
            <li><strong>Auto-generated client:</strong> Type-safe API client generated from your routes</li>
            <li><strong>Drizzle ORM integration:</strong> Full type safety from database to API</li>
            <li><strong>Transaction support:</strong> ACID transactions with AsyncLocalStorage</li>
            <li><strong>Connection pooling:</strong> Persistent database connections for better performance</li>
            <li><strong>File-based routing:</strong> Automatic route discovery like Next.js</li>
          </ul>

          <h2 className="text-2xl font-semibold mb-4">Getting Started</h2>
          <div className="grid gap-6 md:grid-cols-3 mb-12">
            <Link
              href="/docs/installation"
              className="block p-6 border border-gray-200 dark:border-gray-800 rounded-lg hover:border-primary transition-colors"
            >
              <h3 className="text-lg font-semibold mb-2">Installation</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Get started with SPFN in your Next.js project
              </p>
            </Link>

            <Link
              href="/docs/concepts"
              className="block p-6 border border-gray-200 dark:border-gray-800 rounded-lg hover:border-primary transition-colors"
            >
              <h3 className="text-lg font-semibold mb-2">Core Concepts</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Learn about SPFN architecture and design principles
              </p>
            </Link>

            <Link
              href="/docs/examples"
              className="block p-6 border border-gray-200 dark:border-gray-800 rounded-lg hover:border-primary transition-colors"
            >
              <h3 className="text-lg font-semibold mb-2">Examples</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Real-world examples and code samples
              </p>
            </Link>
          </div>

          <h2 className="text-2xl font-semibold mb-4">Quick Example</h2>
          <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto mb-8">
            <code>{`// Define contract
export const getUserContract = {
  method: 'GET',
  path: '/:id',
  params: Type.Object({ id: Type.String() }),
  response: Type.Object({
    id: Type.Number(),
    name: Type.String(),
    email: Type.String({ format: 'email' })
  })
};

// Implement route
export const GET = bind(getUserContract, async (c) => {
  const user = await userRepo.findById(c.params.id);
  if (!user) return c.notFound();
  return c.json(user);
});

// Use in Next.js (fully typed!)
const user = await api.users.getById({ params: { id: '123' } });`}</code>
          </pre>

          <h2 className="text-2xl font-semibold mb-4">External Resources</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li><a href="https://github.com/spfn/spfn" className="text-primary hover:underline">GitHub Repository</a></li>
            <li><a href="https://www.npmjs.com/package/@spfn/core" className="text-primary hover:underline">NPM Package (@spfn/core)</a></li>
            <li><a href="https://www.npmjs.com/package/spfn" className="text-primary hover:underline">NPM Package (spfn)</a></li>
            <li><a href="https://github.com/spfn/spfn/discussions" className="text-primary hover:underline">GitHub Discussions</a></li>
          </ul>
        </div>
      </div>
    </div>
  );
}