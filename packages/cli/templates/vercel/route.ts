/**
 * Vercel serverless adapter for the SPFN Hono API.
 *
 * The SPFN-specific bootstrap lives in the core: `createServerlessApp()`
 * (from `@spfn/core/server`) returns a listen-free, memoized Hono app with the DB
 * initialized in-handler and the periodic health-check disabled. `hono/vercel`'s
 * `handle()` turns it into Vercel Functions. `startServer()` / `spfn start` (the
 * always-on path) is unaffected.
 *
 * The SPFN app is mounted under `/api/backend` so it coexists with Next.js routes on
 * a single Vercel origin. Point the RPC proxy at the same origin in production:
 *   SPFN_API_URL = https://<deployment>/api/backend
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { createServerlessApp } from '@spfn/core/server';
import serverConfig from '@/server/server.config';

// SPFN needs Node APIs (pg, native bcrypt) — the edge runtime cannot host it.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The Vercel Supabase integration injects POSTGRES_URL (Supavisor transaction pooler)
// but not DATABASE_URL, which is what SPFN reads. Map it so the app connects.
process.env.DATABASE_URL ??= process.env.POSTGRES_URL;

let handlerPromise: Promise<(req: Request) => Response | Promise<Response>> | undefined;

function getHandler()
{
    if (!handlerPromise)
    {
        handlerPromise = createServerlessApp(serverConfig).then((spfn) =>
            handle(new Hono().route('/api/backend', spfn)),
        );
    }

    return handlerPromise;
}

async function dispatch(req: Request): Promise<Response>
{
    return (await getHandler())(req);
}

export const GET = dispatch;
export const POST = dispatch;
export const PUT = dispatch;
export const PATCH = dispatch;
export const DELETE = dispatch;
export const OPTIONS = dispatch;
export const HEAD = dispatch;
