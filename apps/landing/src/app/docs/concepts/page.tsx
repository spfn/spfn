import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Core Concepts - SPFN Documentation',
  description: 'Understanding SPFN architecture and design. Learn about contract-based routing, repositories, transactions, and connection pooling.',
};

export default function ConceptsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <Link href="/docs" className="text-primary hover:underline mb-6 inline-block">
          ← Back to Documentation
        </Link>

        <h1 className="text-4xl font-bold mb-4">Core Concepts</h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 mb-12">
          Understanding SPFN architecture and design
        </p>

        <div className="prose dark:prose-invert max-w-none">
          <h2 className="text-2xl font-semibold mb-4">Architecture Overview</h2>
          <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto mb-8">
            <code>{`┌─────────────────────────────────┐
│  Next.js (Port 3790)            │
│  • Landing page                 │
│  • Marketing site               │
│  • Dashboard                    │
└────────────┬────────────────────┘
             │
             │ Type-safe API calls
             │
┌────────────▼────────────────────┐
│  SPFN Backend (Port 8790)       │
│  • REST API                     │
│  • Business logic               │
│  • Transactions                 │
└────────────┬────────────────────┘
             │
┌────────────▼────────────────────┐
│  PostgreSQL / Redis / etc.      │
└─────────────────────────────────┘`}</code>
          </pre>

          <h2 className="text-2xl font-semibold mb-4">Contract-based Routing</h2>
          <p className="mb-4">Define API contracts with TypeScript and validation:</p>
          <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto mb-6">
            <code>{`// src/server/routes/users/contract.ts
import { Type } from '@sinclair/typebox';

export const getUserContract = {
  method: 'GET',
  path: '/:id',
  params: Type.Object({
    id: Type.String()
  }),
  response: Type.Object({
    id: Type.Number(),
    name: Type.String(),
    email: Type.String({ format: 'email' })
  })
};

// Implement the route
export const GET = bind(getUserContract, async (c) => {
  const user = await repo.findById(c.params.id);
  if (!user) return c.notFound();
  return c.json(user);
});`}</code>
          </pre>

          <h2 className="text-2xl font-semibold mb-4">Repository Pattern</h2>
          <p className="mb-4">Type-safe database access with Drizzle ORM:</p>
          <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto mb-6">
            <code>{`// src/server/entities/users.ts
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Auto-generated repository
export const userRepo = createRepository(users);

// Usage
const allUsers = await userRepo.findMany();
const user = await userRepo.findById(1);
const active = await userRepo.findMany({
  where: { status: 'active' },
  limit: 10,
});`}</code>
          </pre>

          <h2 className="text-2xl font-semibold mb-4">Transactions</h2>
          <p className="mb-4">Safe database transactions with AsyncLocalStorage:</p>
          <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto mb-6">
            <code>{`import { tx } from '@spfn/core';

export const transferMoney = async (fromId, toId, amount) => {
  return await tx(async () => {
    // All queries use the same transaction
    await accountRepo.decrement(fromId, amount);
    await accountRepo.increment(toId, amount);
    await logRepo.create({ type: 'transfer', amount });

    // If any query fails, entire transaction rolls back
  });
};`}</code>
          </pre>

          <h2 className="text-2xl font-semibold mb-4">File-based Routing</h2>
          <p className="mb-4">Automatic route discovery:</p>
          <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto mb-6">
            <code>{`src/server/routes/
├── users/
│   ├── index.ts           → GET  /users
│   ├── [id]/
│   │   ├── index.ts       → GET  /users/:id
│   │   └── posts/
│   │       └── index.ts   → GET  /users/:id/posts
│   └── contract.ts`}</code>
          </pre>

          <h2 className="text-2xl font-semibold mb-4">Auto-generated Client</h2>
          <p className="mb-4">SPFN automatically generates a type-safe client:</p>
          <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto mb-6">
            <code>{`// Auto-generated src/lib/api.ts
import { api } from '@/lib/api';

// Fully typed!
const user = await api.users.getById({
  params: { id: '123' }
});

const users = await api.users.list({
  query: { page: 1, limit: 10 }
});`}</code>
          </pre>

          <h2 className="text-2xl font-semibold mb-4">SPFN vs Next.js API Routes</h2>
          <div className="overflow-x-auto mb-8">
            <table className="min-w-full border-collapse border border-gray-200 dark:border-gray-800">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900">
                  <th className="border border-gray-200 dark:border-gray-800 px-4 py-2 text-left">Feature</th>
                  <th className="border border-gray-200 dark:border-gray-800 px-4 py-2 text-left">Next.js API Routes</th>
                  <th className="border border-gray-200 dark:border-gray-800 px-4 py-2 text-left">SPFN</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-200 dark:border-gray-800 px-4 py-2">Serverless</td>
                  <td className="border border-gray-200 dark:border-gray-800 px-4 py-2">✅ Yes</td>
                  <td className="border border-gray-200 dark:border-gray-800 px-4 py-2">❌ Always-on</td>
                </tr>
                <tr>
                  <td className="border border-gray-200 dark:border-gray-800 px-4 py-2">Connection Pooling</td>
                  <td className="border border-gray-200 dark:border-gray-800 px-4 py-2">❌ Cold starts</td>
                  <td className="border border-gray-200 dark:border-gray-800 px-4 py-2">✅ Persistent</td>
                </tr>
                <tr>
                  <td className="border border-gray-200 dark:border-gray-800 px-4 py-2">Transactions</td>
                  <td className="border border-gray-200 dark:border-gray-800 px-4 py-2">⚠️ Limited</td>
                  <td className="border border-gray-200 dark:border-gray-800 px-4 py-2">✅ Full support</td>
                </tr>
                <tr>
                  <td className="border border-gray-200 dark:border-gray-800 px-4 py-2">Background Jobs</td>
                  <td className="border border-gray-200 dark:border-gray-800 px-4 py-2">❌ No</td>
                  <td className="border border-gray-200 dark:border-gray-800 px-4 py-2">✅ Built-in</td>
                </tr>
                <tr>
                  <td className="border border-gray-200 dark:border-gray-800 px-4 py-2">Type Safety</td>
                  <td className="border border-gray-200 dark:border-gray-800 px-4 py-2">⚠️ Manual</td>
                  <td className="border border-gray-200 dark:border-gray-800 px-4 py-2">✅ Automatic</td>
                </tr>
                <tr>
                  <td className="border border-gray-200 dark:border-gray-800 px-4 py-2">Best For</td>
                  <td className="border border-gray-200 dark:border-gray-800 px-4 py-2">Simple endpoints</td>
                  <td className="border border-gray-200 dark:border-gray-800 px-4 py-2">Complex backend</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h2 className="text-2xl font-semibold mb-4">Next Steps</h2>
          <Link
            href="/docs/examples"
            className="inline-block px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            See Real Examples →
          </Link>
        </div>
      </div>
    </div>
  );
}