import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { Type } from '@sinclair/typebox';
import { sql, type EmptyRelations } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { Hono } from 'hono';
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';

import { defineRouter, registerRoutes, route } from '../../../route';
import {
    BaseRepository,
    closeDatabase,
    getDatabase,
    initDatabase,
    runInTransaction,
    type DatabaseProvider,
    type DatabaseTransaction,
} from '../../index';

const projects = pgTable('provider_projects', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    metadata: jsonb('metadata').$type<{ source: string }>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

const works = pgTable('provider_works', {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id),
    title: text('title').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

type Work = typeof works.$inferSelect;

describe('PGlite database provider', () =>
{
    let dataDirectory: string | undefined;

    afterEach(async () =>
    {
        await closeDatabase();

        if (dataDirectory)
        {
            await rm(dataDirectory, { recursive: true, force: true });
            dataDirectory = undefined;
        }
    });

    it('supports routes, transactions, provider close, and file-backed reopen', { timeout: 60_000 }, async () =>
    {
        dataDirectory = await mkdtemp(join(tmpdir(), 'spfn-pglite-provider-'));
        const dataDir = pathToFileURL(dataDirectory).href;
        const client = await PGlite.create(dataDir);
        const db = drizzle({ client });
        let closeCalls = 0;

        class PgliteRepository extends BaseRepository<EmptyRelations, typeof db>
        {
            createProject(id: string, name: string): Promise<typeof projects.$inferSelect>
            {
                return this._create(projects, {
                    id,
                    name,
                    metadata: { source: 'pglite' },
                });
            }

            createWork(id: string, projectId: string, title: string): Promise<Work>
            {
                return this._create(works, { id, projectId, title });
            }

            driverClientIsNotTransactionSafe(): unknown
            {
                // @ts-expect-error Driver-only members are unavailable in transaction-aware repositories.
                return this.db.$client;
            }
        }

        const provider = {
            kind: 'pglite',
            write: db,
            close: async () =>
            {
                closeCalls++;
                await client.close();
            },
        } satisfies DatabaseProvider<typeof db>;

        const initialized = await initDatabase({ provider });
        expectTypeOf(initialized.write).toEqualTypeOf<typeof db | undefined>();
        expectTypeOf(getDatabase<typeof db>()).toEqualTypeOf<typeof db>();
        expect(getDatabase<typeof db>()).toBe(db);

        await db.execute(sql`
            CREATE TABLE provider_projects (
                id text PRIMARY KEY,
                name text NOT NULL,
                metadata jsonb NOT NULL,
                created_at timestamptz NOT NULL DEFAULT now()
            )
        `);
        await db.execute(sql`
            CREATE TABLE provider_works (
                id text PRIMARY KEY,
                project_id text NOT NULL REFERENCES provider_projects(id),
                title text NOT NULL,
                created_at timestamptz NOT NULL DEFAULT now()
            )
        `);

        const repository = new PgliteRepository();
        await repository.createProject('project-1', 'Local project');

        const createWork = route.post('/projects/:projectId/works')
            .input({
                params: Type.Object({ projectId: Type.String() }),
                body: Type.Object({ id: Type.String(), title: Type.String() }),
            })
            .handler(async (c) =>
            {
                const { params, body } = await c.data();

                return await runInTransaction<Work, typeof db>(async (tx) =>
                {
                    expectTypeOf(tx).toEqualTypeOf<DatabaseTransaction<typeof db>>();

                    return await repository.createWork(body.id, params.projectId, body.title);
                });
            });

        const app = new Hono();
        registerRoutes(app, defineRouter({ createWork }));

        const response = await app.request('/projects/project-1/works', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: 'work-1', title: 'Persisted work' }),
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            id: 'work-1',
            projectId: 'project-1',
            title: 'Persisted work',
        });

        await closeDatabase();
        await closeDatabase();
        expect(closeCalls).toBe(1);

        const reopenedClient = await PGlite.create(dataDir);
        const reopenedDb = drizzle({ client: reopenedClient });
        const persisted = await reopenedDb.select().from(works);

        expect(persisted).toHaveLength(1);
        expect(persisted[0]).toMatchObject({
            id: 'work-1',
            projectId: 'project-1',
            title: 'Persisted work',
        });

        await reopenedClient.close();
    });
});
