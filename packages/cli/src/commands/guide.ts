import { Command } from 'commander';
import chalk from 'chalk';

/**
 * Contract Guide - Quick Reference
 */
function displayContractGuide(): void
{
    console.log(chalk.bold.cyan('\n📖 Contract Writing Guide\n'));

    console.log(chalk.bold('Basic Structure:\n'));
    console.log(chalk.gray('   // src/server/routes/users/contract.ts'));
    console.log(`   import { Type } from '@sinclair/typebox';
   import type { RouteContract } from '@spfn/core/route';

   export const getUsersContract = {
       method: 'GET' as const,
       path: '/',
       query: Type.Object({
           limit: Type.Optional(Type.Number())
       }),
       response: Type.Object({
           users: Type.Array(Type.Any())
       })
   } as const satisfies RouteContract;\n`);

    console.log(chalk.bold('Common Contract Patterns:\n'));
    console.log(`   ${chalk.cyan('GET')}     method: 'GET', path: '/', query: Type.Object({...})
   ${chalk.cyan('POST')}    method: 'POST', path: '/', body: Type.Object({...})
   ${chalk.cyan('GET :id')} method: 'GET', path: '/:id', params: Type.Object({id: Type.Number()})
   ${chalk.cyan('PATCH')}   method: 'PATCH', path: '/:id', params + body
   ${chalk.cyan('DELETE')}  method: 'DELETE', path: '/:id', params\n`);

    console.log(chalk.bold('TypeBox Types:\n'));
    console.log(`   ${chalk.cyan('Type.String()')}        String
   ${chalk.cyan('Type.Number()')}        Number
   ${chalk.cyan('Type.Boolean()')}       Boolean
   ${chalk.cyan('Type.Array(T)')}        Array of T
   ${chalk.cyan('Type.Object({...})')}   Object with properties
   ${chalk.cyan('Type.Optional(T)')}     Optional field\n`);

    console.log(chalk.bold('Key Rules:\n'));
    console.log(`   ${chalk.green('✓')} Use ${chalk.cyan('as const satisfies RouteContract')}
   ${chalk.green('✓')} Response schema is ${chalk.cyan('required')}
   ${chalk.green('✓')} Co-locate contract.ts with index.ts
   ${chalk.green('✓')} Use ${chalk.cyan('.js')} extension in imports\n`);

    console.log(chalk.gray('📚 More: spfn guide route, spfn guide api\n'));
}

/**
 * Entity & Repository Guide
 */
function displayEntityGuide(): void
{
    console.log(chalk.bold.cyan('\n📖 Entity & Repository Guide\n'));

    console.log(chalk.bold('1. Define Entity:\n'));
    console.log(chalk.gray('   // src/server/entities/users.ts'));
    console.log(`   import { pgTable, text } from 'drizzle-orm/pg-core';
   import { id, timestamps } from '@spfn/core/db';

   export const users = pgTable('users', {
       id: id(),                    // bigserial primary key
       email: text('email').notNull().unique(),
       name: text('name').notNull(),
       ...timestamps(),             // createdAt + updatedAt
   });

   export type User = typeof users.$inferSelect;
   export type NewUser = typeof users.$inferInsert;\n`);

    console.log(chalk.bold('2. Create Repository:\n'));
    console.log(chalk.gray('   // src/server/repositories/users.repository.ts'));
    console.log(`   import { findOne, findMany, create, updateOne, deleteOne } from '@spfn/core/db';
   import { users, type User, type NewUser } from '../entities/users.js';

   export async function findById(id: number): Promise<User | null>
   {
       return findOne(users, { id });
   }

   export async function findAll()
   {
       return findMany(users, { limit: 100 });
   }

   export const usersRepository = {
       findById,
       findAll,
       // ... more methods
   };\n`);

    console.log(chalk.bold('3. Use in Routes:\n'));
    console.log(chalk.gray('   // src/server/routes/users/index.ts'));
    console.log(`   import { createApp } from '@spfn/core/route';
   import { usersRepository } from '../../repositories/users.repository.js';
   import { getUsersContract } from './contract.js';

   const app = createApp();

   app.bind(getUsersContract, async (c) => {
       const users = await usersRepository.findAll();
       return c.json({ users });
   });

   export default app;\n`);

    console.log(chalk.bold('Helper Functions:\n'));
    console.log(`   ${chalk.cyan('findOne(table, where)')}     Find single record
   ${chalk.cyan('findMany(table, options)')}  Find multiple records
   ${chalk.cyan('create(table, data)')}       Create record
   ${chalk.cyan('updateOne(table, where, data)')} Update record
   ${chalk.cyan('deleteOne(table, where)')}   Delete record
   ${chalk.cyan('count(table, where)')}       Count records\n`);

    console.log(chalk.bold('Complex Queries:\n'));
    console.log(`   ${chalk.gray('// Use getDatabase() for complex queries')}
   import { getDatabase } from '@spfn/core/db';
   import { eq, and } from 'drizzle-orm';

   const db = getDatabase('read');  // or 'write'
   const result = await db
       .select()
       .from(users)
       .where(eq(users.email, 'test@example.com'));
\n`);

    console.log(chalk.gray('📚 More: @spfn/core entities/README.md\n'));
}

/**
 * Route Pattern Guide
 */
function displayRouteGuide(): void
{
    console.log(chalk.bold.cyan('\n📖 Route Pattern Guide\n'));

    console.log(chalk.bold('File Structure → URL Mapping:\n'));
    console.log(`   routes/
   ├── users/
   │   ├── contract.ts       ${chalk.gray('→ contracts')}
   │   ├── index.ts          ${chalk.gray('→ GET/POST /users')}
   │   └── [id]/
   │       ├── contract.ts
   │       └── index.ts      ${chalk.gray('→ GET/PATCH/DELETE /users/:id')}
   └── posts/
       └── [...slug].ts      ${chalk.gray('→ GET /posts/* (catch-all)')}\n`);

    console.log(chalk.bold('Dynamic Routes:\n'));
    console.log(`   ${chalk.cyan('[id]')}        → ${chalk.gray(':id')}       (path parameter)
   ${chalk.cyan('[...slug]')}   → ${chalk.gray('*')}         (catch-all)\n`);

    console.log(chalk.bold('Route Handler Pattern:\n'));
    console.log(chalk.gray('   // src/server/routes/users/index.ts'));
    console.log(`   import { createApp } from '@spfn/core/route';
   import { getUsersContract, createUserContract } from './contract.js';

   const app = createApp();

   // GET /users
   app.bind(getUsersContract, async (c) => {
       const { limit = 10 } = c.query;
       return c.json({ users: [] });
   });

   // POST /users
   app.bind(createUserContract, async (c) => {
       const data = await c.data();  // Validated body
       return c.json({ user: data });
   });

   export default app;  // Must export default\n`);

    console.log(chalk.bold('Context Properties:\n'));
    console.log(`   ${chalk.cyan('c.params')}    Path parameters (typed)
   ${chalk.cyan('c.query')}     Query parameters (typed)
   ${chalk.cyan('c.data()')}    Request body (validated)
   ${chalk.cyan('c.json()')}    JSON response (typed)
   ${chalk.cyan('c.raw')}       Raw Hono context\n`);

    console.log(chalk.bold('Middleware Control:\n'));
    console.log(`   ${chalk.gray('// Skip auth for public routes')}
   meta: {
       skipMiddlewares: ['auth']
   }\n`);

    console.log(chalk.gray('📚 More: @spfn/core/route/README.md\n'));
}

/**
 * API Client Auto-generation Guide
 */
function displayApiGuide(): void
{
    console.log(chalk.bold.cyan('\n📖 API Client Auto-generation Guide\n'));

    console.log(chalk.bold('How it Works:\n'));
    console.log(`   1. You write contracts in ${chalk.cyan('src/server/routes/**/contract.ts')}
   2. Run ${chalk.cyan('spfn dev')} or ${chalk.cyan('spfn build')}
   3. ${chalk.cyan('src/lib/api.ts')} auto-generated with type-safe client
   4. Use in frontend: ${chalk.cyan('import { api } from \'@/lib/api.js\';')}\n`);

    console.log(chalk.bold('Generated Client Structure:\n'));
    console.log(chalk.gray('   // src/lib/api.ts (auto-generated)'));
    console.log(`   export const api = {
       users: {
           get: () => client.call('/users', getUsersContract),
           post: (options) => client.call('/users', createUserContract, options),
           getById: (options) => client.call('/users/:id', getUserContract, options)
       },
       posts: {
           get: () => client.call('/posts', getPostsContract),
           // ...
       }
   };\n`);

    console.log(chalk.bold('Usage in Frontend:\n'));
    console.log(chalk.gray('   // Client Component'));
    console.log(`   'use client';
   import { api } from '../lib/api.js';

   export function UserList() {
       const [users, setUsers] = useState([]);

       useEffect(() => {
           api.users.get().then(res => res.json()).then(data => {
               setUsers(data.users);  // Fully typed!
           });
       }, []);

       return <div>{users.map(u => <div>{u.name}</div>)}</div>;
   }\n`);

    console.log(chalk.bold('Server Component:\n'));
    console.log(`   import { api } from '@/lib/api.js';

   export async function ServerUserList() {
       const response = await api.users.get();
       const { users } = await response.json();  // Typed!

       return <div>{users.map(u => <div>{u.name}</div>)}</div>;
   }\n`);

    console.log(chalk.bold('Key Benefits:\n'));
    console.log(`   ${chalk.green('✓')} Type-safe: Full TypeScript inference
   ${chalk.green('✓')} Auto-sync: Contract changes auto-update client
   ${chalk.green('✓')} No manual work: Zero boilerplate
   ${chalk.green('✓')} IDE support: Auto-complete everywhere\n`);

    console.log(chalk.bold('Customization:\n'));
    console.log(chalk.gray('   // Add interceptors'));
    console.log(`   import { client } from './api.js';

   client.use((req) => {
       req.headers.set('Authorization', 'Bearer token');
       return req;
   });\n`);

    console.log(chalk.gray('📚 Regenerate: Run spfn dev (auto-watch) or spfn build\n'));
}

export const guideCommand = new Command('guide')
    .description('Display development guides')
    .argument('[topic]', 'Guide topic (entity|contract|route|api)', 'contract')
    .action((topic: string) =>
    {
        switch (topic)
        {
            case 'entity':
                displayEntityGuide();
                break;
            case 'contract':
                displayContractGuide();
                break;
            case 'route':
                displayRouteGuide();
                break;
            case 'api':
                displayApiGuide();
                break;
            default:
                console.log(chalk.yellow(`Unknown guide topic: ${topic}\n`));
                console.log(chalk.bold('Available guides:\n'));
                console.log(`  ${chalk.cyan('spfn guide entity')}     Entity & Repository patterns`);
                console.log(`  ${chalk.cyan('spfn guide contract')}   Contract writing quick reference`);
                console.log(`  ${chalk.cyan('spfn guide route')}      Route patterns and file structure`);
                console.log(`  ${chalk.cyan('spfn guide api')}        Auto-generated API client usage\n`);
        }
    });
