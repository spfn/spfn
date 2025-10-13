import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Examples - SPFN Documentation',
  description: 'Real-world SPFN implementations. CRUD API, transactions, background jobs, WebSocket, authentication, and file uploads.',
};

export default function ExamplesPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <Link href="/docs" className="text-primary hover:underline mb-6 inline-block">
          ← Back to Documentation
        </Link>

        <h1 className="text-4xl font-bold mb-4">Examples</h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 mb-12">
          Real-world SPFN implementations
        </p>

        <div className="prose dark:prose-invert max-w-none">
          <h2 className="text-2xl font-semibold mb-4">Complete CRUD API</h2>
          <p className="mb-4">Generate a full CRUD API in one command:</p>
          <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto mb-6">
            <code>{`npx spfn@alpha generate posts`}</code>
          </pre>

          <p className="mb-4">This creates entity, API routes, and repository:</p>
          <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto mb-8">
            <code>{`// src/server/entities/posts.ts
export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content'),
  authorId: integer('author_id').notNull(),
  status: text('status').default('draft'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Use in Next.js
import { api } from '@/lib/api';

export default async function PostsPage() {
  const posts = await api.posts.list();

  return (
    <div>
      {posts.map(post => (
        <article key={post.id}>
          <h2>{post.title}</h2>
          <p>{post.content}</p>
        </article>
      ))}
    </div>
  );
}`}</code>
          </pre>

          <h2 className="text-2xl font-semibold mb-4">Transaction Example</h2>
          <p className="mb-4">Transfer money between accounts:</p>
          <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto mb-8">
            <code>{`// src/server/routes/transactions/index.ts
import { tx } from '@spfn/core';

export const transferMoney = bind(transferContract, async (c) => {
  const { fromAccountId, toAccountId, amount } = c.body;

  const result = await tx(async () => {
    // Debit from account
    const from = await accountRepo.findById(fromAccountId);
    if (from.balance < amount) {
      throw new Error('Insufficient funds');
    }
    await accountRepo.update(fromAccountId, {
      balance: from.balance - amount
    });

    // Credit to account
    await accountRepo.update(toAccountId, {
      balance: toAccountId.balance + amount
    });

    // Create transaction record
    const transaction = await transactionRepo.create({
      fromAccountId,
      toAccountId,
      amount,
      status: 'completed'
    });

    return transaction;
  });

  return c.json(result);
});`}</code>
          </pre>

          <h2 className="text-2xl font-semibold mb-4">Background Job Example</h2>
          <p className="mb-4">Send welcome email after user registration:</p>
          <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto mb-8">
            <code>{`// src/server/workers/email.ts
import { createWorker } from '@spfn/core';

export const emailWorker = createWorker({
  name: 'email',
  async process(job) {
    const { to, subject, body } = job.data;
    await sendEmail({ to, subject, body });
  }
});

// src/server/routes/users/index.ts
export const POST = bind(createUserContract, async (c) => {
  const user = await userRepo.create(c.body);

  // Queue welcome email
  await emailWorker.add({
    to: user.email,
    subject: 'Welcome to SPFN!',
    body: \`Hi \${user.name}, welcome aboard!\`
  });

  return c.json(user, 201);
});`}</code>
          </pre>

          <h2 className="text-2xl font-semibold mb-4">WebSocket Example</h2>
          <p className="mb-4">Real-time chat:</p>
          <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto mb-8">
            <code>{`// src/server/websocket/chat.ts
import { createWebSocketHandler } from '@spfn/core';

export const chatHandler = createWebSocketHandler({
  onConnect: (ws, req) => {
    const userId = req.query.userId;
    ws.subscribe(\`user-\${userId}\`);
  },

  onMessage: async (ws, message) => {
    const { roomId, text } = JSON.parse(message);

    // Save to database
    const msg = await messageRepo.create({
      roomId,
      userId: ws.userId,
      text
    });

    // Broadcast to room
    ws.publish(\`room-\${roomId}\`, JSON.stringify(msg));
  },
});`}</code>
          </pre>

          <h2 className="text-2xl font-semibold mb-4">Authentication Example</h2>
          <p className="mb-4">JWT-based auth:</p>
          <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto mb-8">
            <code>{`// src/server/middleware/auth.ts
export const authMiddleware = async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return c.unauthorized();
  }

  const payload = await verifyJWT(token);
  c.set('user', payload);

  return next();
};

// src/server/routes/profile/index.ts
export const GET = bind(
  getProfileContract,
  authMiddleware,
  async (c) => {
    const user = c.get('user');
    const profile = await userRepo.findById(user.id);
    return c.json(profile);
  }
);`}</code>
          </pre>

          <h2 className="text-2xl font-semibold mb-4">File Upload Example</h2>
          <p className="mb-4">Handle file uploads with validation:</p>
          <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto mb-8">
            <code>{`// src/server/routes/upload/index.ts
export const POST = bind(uploadContract, async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File;

  // Validate
  if (!file.type.startsWith('image/')) {
    return c.badRequest('Only images allowed');
  }

  if (file.size > 5 * 1024 * 1024) {
    return c.badRequest('File too large');
  }

  // Save to storage
  const url = await storage.upload(file);

  // Save metadata
  const upload = await uploadRepo.create({
    filename: file.name,
    url,
    size: file.size,
    mimeType: file.type
  });

  return c.json(upload);
});`}</code>
          </pre>

          <h2 className="text-2xl font-semibold mb-4">More Examples</h2>
          <p className="mb-6">Check out the GitHub repository for more examples:</p>
          <ul className="list-disc pl-6 mb-8">
            <li>E-commerce backend</li>
            <li>Social media API</li>
            <li>Real-time collaboration</li>
            <li>File processing pipeline</li>
          </ul>

          <h2 className="text-2xl font-semibold mb-4">External Resources</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li><a href="https://github.com/spfn/spfn" className="text-primary hover:underline">GitHub Repository</a></li>
            <li><a href="https://github.com/spfn/spfn/tree/main/packages/core" className="text-primary hover:underline">API Reference</a></li>
            <li><a href="https://github.com/spfn/spfn/discussions" className="text-primary hover:underline">GitHub Discussions</a></li>
          </ul>
        </div>
      </div>
    </div>
  );
}