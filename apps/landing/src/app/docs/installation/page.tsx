import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Installation - SPFN Documentation',
  description: 'Install SPFN in your Next.js project. Get started with type-safe backend development.',
};

export default function InstallationPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <Link href="/docs" className="text-primary hover:underline mb-6 inline-block">
          ← Back to Documentation
        </Link>

        <h1 className="text-4xl font-bold mb-4">Installation</h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 mb-12">
          Install SPFN in your Next.js project
        </p>

        <div className="prose dark:prose-invert max-w-none">
          <h2 className="text-2xl font-semibold mb-4">Requirements</h2>
          <ul className="list-disc pl-6 mb-8">
            <li><strong>Node.js</strong> 18+</li>
            <li><strong>Next.js</strong> 15+ (App Router)</li>
            <li><strong>PostgreSQL</strong> (optional: Redis)</li>
          </ul>

          <h2 className="text-2xl font-semibold mb-4">Option 1: Create New Project (Recommended)</h2>
          <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto mb-6">
            <code>{`# Create new project with SPFN + Next.js
npx spfn@alpha create my-app
cd my-app`}</code>
          </pre>

          <p className="mb-6">This creates a complete setup with:</p>
          <ul className="list-disc pl-6 mb-8">
            <li>Next.js 15 with App Router</li>
            <li>SPFN backend runtime</li>
            <li>TypeScript configuration</li>
            <li>Tailwind CSS</li>
            <li>Docker Compose (PostgreSQL + Redis)</li>
            <li><strong>.guide/</strong> directory with quick-start and deployment guides</li>
            <li>Production Docker files (Dockerfile, .dockerignore, docker-compose.production.yml)</li>
          </ul>

          <h2 className="text-2xl font-semibold mb-4">Option 2: Add to Existing Next.js Project</h2>
          <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto mb-6">
            <code>{`cd your-nextjs-project
npx spfn@alpha init`}</code>
          </pre>

          <p className="mb-4">This adds SPFN to your existing Next.js application and creates:</p>
          <ul className="list-disc pl-6 mb-8">
            <li><code>src/server/</code> - Backend structure (routes, entities, repositories)</li>
            <li><code>docker-compose.yml</code> - PostgreSQL + Redis for development</li>
            <li><code>.guide/</code> - Quick-start and deployment guides (⭐ Use with AI!)</li>
            <li><code>Dockerfile</code>, <code>.dockerignore</code>, <code>docker-compose.production.yml</code> - Production deployment</li>
            <li><code>.env.local.example</code> - Environment variable template</li>
            <li><code>spfn.json</code> - Project configuration</li>
            <li>Updates <code>tsconfig.json</code> to exclude <code>src/server</code> (for Vercel)</li>
          </ul>

          <h2 className="text-2xl font-semibold mb-4">Start Development</h2>
          <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto mb-6">
            <code>{`# Start databases (if using Docker)
docker compose up -d

# Copy environment variables
cp .env.local.example .env.local

# Start dev server
npm run spfn:dev`}</code>
          </pre>

          <p className="mb-6"><strong>Two servers will start:</strong></p>
          <ul className="list-disc pl-6 mb-8">
            <li>Frontend (Next.js): <code>http://localhost:3790</code></li>
            <li>Backend (SPFN): <code>http://localhost:8790</code></li>
          </ul>

          <h2 className="text-2xl font-semibold mb-4">Environment Variables</h2>
          <p className="mb-4">Create <code>.env.local</code> with:</p>
          <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto mb-8">
            <code>{`# Database
DATABASE_URL=postgresql://spfn:spfn@localhost:5432/spfn_dev

# Redis (optional)
REDIS_URL=redis://localhost:6379

# SPFN
SPFN_PORT=8790
NEXT_PUBLIC_API_URL=http://localhost:8790`}</code>
          </pre>

          <h2 className="text-2xl font-semibold mb-4">Verify Installation</h2>
          <p className="mb-4">Create a test endpoint:</p>
          <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto mb-6">
            <code>{`npx spfn@alpha generate users`}</code>
          </pre>

          <p className="mb-6">This generates:</p>
          <ul className="list-disc pl-6 mb-8">
            <li>Entity template (<code>entities/users.ts</code>)</li>
            <li>REST API (5 CRUD endpoints)</li>
            <li>Repository with pagination</li>
            <li>Auto-generated client for Next.js</li>
          </ul>

          <h2 className="text-2xl font-semibold mb-4">Next Steps</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Link
              href="/docs/concepts"
              className="block p-4 border border-gray-200 dark:border-gray-800 rounded-lg hover:border-primary transition-colors"
            >
              <h3 className="font-semibold mb-1">Core Concepts →</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">Learn how SPFN works</p>
            </Link>

            <Link
              href="/docs/examples"
              className="block p-4 border border-gray-200 dark:border-gray-800 rounded-lg hover:border-primary transition-colors"
            >
              <h3 className="font-semibold mb-1">Examples →</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">See real-world examples</p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}