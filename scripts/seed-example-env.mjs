#!/usr/bin/env node
/**
 * Give every example the `.env.local` its build needs, from the committed template.
 *
 * Why this exists: `pnpm build` at the repository root reaches the examples, and
 * an example's `next build` collects page data — which validates the environment.
 * `SPFN_API_URL` is required there, and it lives in `.env.local`, which is
 * gitignored. So a fresh clone cannot run the repository's own documented verify
 * command: the build fails at `01-minimal-api`, turbo cancels the remaining
 * builds, `@spfn/auth` never produces `dist/`, and 34 of its test files then fail
 * on `Cannot find package '@spfn/auth/config'`. One missing file, five symptoms.
 *
 * An existing `.env.local` is never touched — a developer's own values, including
 * ones that differ from the template on purpose, must survive this running.
 */

import { copyFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXAMPLES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples');

let seeded = 0;
let kept = 0;

for (const name of readdirSync(EXAMPLES_DIR, { withFileTypes: true }))
{
    if (!name.isDirectory())
    {
        continue;
    }

    const template = join(EXAMPLES_DIR, name.name, '.env.local.example');
    const target = join(EXAMPLES_DIR, name.name, '.env.local');

    if (!existsSync(template))
    {
        continue;
    }

    if (existsSync(target))
    {
        console.log(`kept   ${name.name}/.env.local (already present)`);
        kept += 1;

        continue;
    }

    copyFileSync(template, target);
    console.log(`seeded ${name.name}/.env.local from .env.local.example`);
    seeded += 1;
}

console.log(`${seeded} seeded, ${kept} left alone`);
