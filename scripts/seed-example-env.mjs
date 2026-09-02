#!/usr/bin/env node
/**
 * Give every example the env files its build and its server need, from the
 * committed templates.
 *
 * Why this exists: `pnpm build` at the repository root reaches the examples, and
 * an example's `next build` collects page data — which validates the environment.
 * `SPFN_API_URL` is required there, and it lives in `.env.local`, which is
 * gitignored. So a fresh clone cannot run the repository's own documented verify
 * command: the build fails at `01-minimal-api`, turbo cancels the remaining
 * builds, `@spfn/auth` never produces `dist/`, and 34 of its test files then fail
 * on `Cannot find package '@spfn/auth/config'`. One missing file, five symptoms.
 *
 * `.env.server` is seeded the same way, from `.env.server.example`: the reference
 * is split by consumer, so the backend-only keys (`DATABASE_URL`, `CACHE_URL`, …)
 * an example needs at run time are no longer in `.env.local`.
 *
 * An existing file is never touched — a developer's own values, including ones
 * that differ from the template on purpose, must survive this running.
 */

import { copyFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXAMPLES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples');

const SEEDED_FILES = ['.env.local', '.env.server'];

let seeded = 0;
let kept = 0;

for (const entry of readdirSync(EXAMPLES_DIR, { withFileTypes: true }))
{
    if (!entry.isDirectory())
    {
        continue;
    }

    for (const file of SEEDED_FILES)
    {
        seedFile(entry.name, file);
    }
}

console.log(`${seeded} seeded, ${kept} left alone`);

/**
 * Copy `<example>/<file>.example` to `<example>/<file>`, unless the example ships
 * no such template or the developer already has the file.
 */
function seedFile(example, file)
{
    const template = join(EXAMPLES_DIR, example, `${file}.example`);
    const target = join(EXAMPLES_DIR, example, file);

    if (!existsSync(template))
    {
        return;
    }

    if (existsSync(target))
    {
        console.log(`kept   ${example}/${file} (already present)`);
        kept += 1;

        return;
    }

    copyFileSync(template, target);
    console.log(`seeded ${example}/${file} from ${file}.example`);
    seeded += 1;
}
