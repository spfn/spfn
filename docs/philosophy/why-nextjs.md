---
title: "Why Next.js?"
description: "Why Superfunction is built for Next.js"
order: 4
available: true
---

# Why Next.js?

Superfunction is designed specifically for Next.js. Here's why.

## The Short Answer

Next.js is the most **complete React framework** with production-ready features out of the box:

- ✅ Server-side rendering (SSR) & Static generation (SSG)
- ✅ File-based routing with layouts
- ✅ Built-in optimization (images, fonts, scripts)
- ✅ API routes for simple endpoints
- ✅ TypeScript-first with excellent tooling
- ✅ Deployment-ready (Vercel, Docker, anywhere)

## Next.js vs React + Vite

### Feature Comparison

| Feature | Next.js | React + Vite |
|---------|---------|--------------|
| **SSR/SSG** | ✅ Built-in, zero config | ❌ Manual setup required |
| **Routing** | ✅ File-based with nested layouts | ⚠️ Requires React Router setup |
| **Code Splitting** | ✅ Automatic per route | ⚠️ Manual configuration |
| **SEO** | ✅ Excellent (SSR/SSG) | ⚠️ CSR only (requires work) |
| **Image Optimization** | ✅ Built-in `<Image>` component | ❌ Manual implementation |
| **Font Optimization** | ✅ Automatic font loading | ❌ Manual setup |
| **API Routes** | ✅ Built-in `/app/api` | ❌ Separate backend needed |
| **Metadata** | ✅ Built-in `<Metadata>` API | ⚠️ React Helmet or manual |
| **Development Speed** | ✅ Fast Refresh | ✅ Fast HMR |
| **Production Build** | ✅ Optimized by default | ⚠️ Requires configuration |

### Developer Experience

**Next.js:**
```bash
# One command to start
npx create-next-app@latest
npm run dev

# Everything works out of the box
# SSR, routing, optimization, TypeScript
```

**React + Vite:**
```bash
# Need to install and configure
npm create vite@latest
npm install react-router-dom
# Configure routing
# Set up SSR (if needed)
# Configure build optimization
# Set up metadata management
```

## Why It Matters for Superfunction

### 1. Monorepo Architecture

**One project, two servers:**

```
my-app/
├── src/
│   ├── app/              # Next.js frontend
│   │   ├── page.tsx      # Landing page
│   │   ├── dashboard/    # Dashboard pages
│   │   └── blog/         # Blog pages
│   │
│   ├── server/           # Superfunction backend
│   │   └── routes/       # API routes
│   │
│   └── lib/
│       ├── contracts/    # Shared contracts
│       └── api.ts        # Auto-generated client
```

**Benefits:**
- Shared TypeScript configuration
- Shared contracts between backend and frontend
- Single deployment artifact
- No CORS configuration needed

### 2. Marketing + Product in One

Build complete products without separate repositories:

```typescript
// Marketing pages (Next.js SSG)
app/
├── page.tsx              // Landing page
├── pricing/page.tsx      // Pricing page
├── docs/                 // Documentation
└── blog/                 // Blog posts

// Product pages (Next.js SSR with auth)
app/dashboard/
├── page.tsx              // Dashboard overview
├── projects/page.tsx     // Projects list
└── settings/page.tsx     // User settings

// Backend (Superfunction)
server/routes/
├── users/                // User management
├── projects/             // Project CRUD
└── payments/             // Payment processing
```

**Real-world example:**
```typescript
// app/dashboard/page.tsx (Next.js)
import { api } from '@/lib/api';

export default async function Dashboard() {
  // Call Superfunction backend with full type safety
  const projects = await api.projects.list();

  return (
    <div>
      {projects.map(p => (
        <ProjectCard key={p.id} project={p} />
      ))}
    </div>
  );
}
```

### 3. SEO-First Architecture

Next.js makes SEO natural:

```typescript
// app/blog/[slug]/page.tsx
export async function generateMetadata({ params }) {
  const post = await api.blog.getBySlug({ params });

  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      images: [post.coverImage],
    },
  };
}

// Crawlers see fully rendered HTML
// No JavaScript required for content
```

**Why this matters:**
- React + Vite: Client-side only, poor SEO
- Next.js: Server-rendered, excellent SEO

### 4. Type Safety Across the Stack

From database to UI in one TypeScript project:

```typescript
// 1. Database schema (Drizzle)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
});

// 2. Contract (shared)
export const getUserContract = {
  method: 'GET',
  path: '/users/:id',
  response: Type.Object({
    id: Type.Number(),
    name: Type.String(),
    email: Type.String()
  })
};

// 3. Backend route (Superfunction)
export const GET = bind(getUserContract, async (c) => {
  const user = await db.query.users.findFirst({
    where: eq(users.id, c.params.id)
  });
  return c.json(user);
});

// 4. Frontend component (Next.js)
const user = await api.users.getById({ params: { id: '1' } });
// ^ Fully typed! TypeScript knows the exact shape
```

**Complete type flow:**
```
Database → Drizzle → Contract → Backend → Client → Next.js
   ✓         ✓         ✓         ✓         ✓        ✓
```

### 5. Deployment Simplicity

Deploy everything together:

**Vercel (Zero Config):**
```bash
# Push to GitHub
git push

# Vercel automatically:
# 1. Builds Next.js frontend
# 2. Builds Superfunction backend
# 3. Deploys both together
# 4. Sets up domains
```

**Docker (One Image):**
```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY . .

RUN npm install
RUN npm run build

# Start both servers
CMD ["npm", "run", "start"]
```

**Railway (One Click):**
- Connect GitHub repo
- Railway detects Next.js
- Superfunction backend runs alongside
- One URL, both servers

## Next.js Advantages for Superfunction

### Server Components

Use backend data directly in components:

```typescript
// app/dashboard/page.tsx - Server Component
import { api } from '@/lib/api';

export default async function Dashboard() {
  // Runs on server, no API call overhead
  const stats = await api.analytics.getStats();

  return <StatsDisplay stats={stats} />;
}
```

**Benefits:**
- No loading states for initial data
- No API roundtrip (server-to-server)
- Automatic code splitting
- Better performance

### Streaming & Suspense

Progressive rendering for better UX:

```typescript
import { Suspense } from 'react';

export default function Page() {
  return (
    <div>
      <Header /> {/* Renders immediately */}

      <Suspense fallback={<Skeleton />}>
        <SlowComponent /> {/* Streams when ready */}
      </Suspense>
    </div>
  );
}
```

### Built-in Middleware

Authentication, rate limiting, logging:

```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const token = request.cookies.get('session');

  if (!token && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}
```

### Optimizations Out of the Box

Next.js handles the heavy lifting:

- **Images**: Automatic WebP conversion, lazy loading, responsive sizes
- **Fonts**: Preloading, self-hosting, layout shift prevention
- **Scripts**: Deferred loading, priority hints
- **CSS**: Automatic code splitting, minification
- **Bundle**: Tree shaking, code splitting, compression

## Production-Ready Features

### Performance

Next.js is optimized for production:

```typescript
// Automatic code splitting per route
app/dashboard/page.tsx        // Only loads for /dashboard
app/settings/page.tsx         // Only loads for /settings

// Image optimization
<Image
  src="/hero.jpg"
  width={1200}
  height={600}
  priority              // Preload critical images
  quality={90}          // WebP with quality control
/>

// Font optimization
import { Inter } from 'next/font/google';
const inter = Inter({ subsets: ['latin'] });
// Fonts self-hosted, preloaded, no layout shift
```

### Caching Strategy

Built-in intelligent caching:

```typescript
// Static at build time
export const dynamic = 'force-static';

// Revalidate every 60 seconds
export const revalidate = 60;

// Dynamic per request
export const dynamic = 'force-dynamic';

// Cache with fine control
const data = await fetch('/api/data', {
  next: { revalidate: 3600 }
});
```

### Error Handling

Graceful error boundaries:

```typescript
// app/error.tsx - Handles all errors in this layout
export default function Error({ error, reset }) {
  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={reset}>Try again</button>
    </div>
  );
}

// app/not-found.tsx - Custom 404 page
export default function NotFound() {
  return <h2>Page not found</h2>;
}
```

## Real-World Use Cases

### SaaS Product

```
Example: Project management tool

Frontend (Next.js):
- Landing page (SSG)
- Pricing page (SSG)
- Blog (SSG with ISR)
- Dashboard (SSR with auth)
- Project pages (SSR)

Backend (Superfunction):
- User authentication
- Project CRUD
- Real-time collaboration
- Background jobs (email, notifications)
- Stripe webhooks
```

### Mobile App Backend

```
Example: Fitness tracking app

Frontend (Next.js):
- Marketing website
- Web dashboard

Mobile App (React Native):
- iOS/Android apps

Backend (Superfunction):
- API for mobile apps
- User profiles
- Workout tracking
- Progress analytics
- Push notifications
```

### E-commerce

```
Example: Online store

Frontend (Next.js):
- Product pages (SSG with ISR)
- Category pages (SSG)
- Search (SSR)
- Cart & Checkout (SSR with auth)

Backend (Superfunction):
- Product inventory
- Order processing
- Payment integration
- Email notifications
- Admin dashboard API
```

## When Next.js Shines

✅ **Content-heavy sites** - Blogs, docs, marketing pages
✅ **SEO-critical apps** - E-commerce, directories, SaaS marketing
✅ **Full-stack projects** - Marketing + product in one repo
✅ **Data-driven apps** - Dashboards, analytics, admin panels
✅ **Progressive enhancement** - Works without JavaScript

## Getting Started

Create a Superfunction + Next.js project:

```bash
npx spfn@alpha create my-app
cd my-app
npm run spfn:dev

# Two servers running:
# - Next.js: http://localhost:3790
# - Superfunction: http://localhost:8790
```

See [Quick Start](/docs/getting-started/quick-start) for detailed instructions.

## Next Steps

- [Quick Start](/docs/getting-started/quick-start) - Create your first project
- [How It Works](/docs/architecture/how-it-works) - Understand the architecture
- [Deployment](/docs/guides/deployment) - Deploy to production