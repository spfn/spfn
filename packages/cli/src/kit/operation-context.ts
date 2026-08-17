/**
 * The few facts a resume needs that the journal contract has no field for.
 *
 * The journal is a frozen cross-repository contract, and widening it to hold a
 * setup URL and a target directory would mean changing a schema three
 * repositories read — for two values that are local, machine-specific and of no
 * interest to anyone but this CLI. So they live beside it in a file the CLI
 * owns outright, under the same gitignored directory, and with the same rule
 * about content: public locators only, never a secret.
 */

import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { kitPaths } from './paths.js';

export interface KitOperationContextV1
{
    schemaVersion: 1;
    operationId: string;
    /** The public setup locator the install started from. */
    setupUrl?: string;
    catalogUrl: string;
    manifestUrl: string;
    /** Approval the caller supplied, so a resume applies the same plan. */
    approvedPlanDigest?: string;
}

export function contextFile(root: string): string
{
    return join(kitPaths(root).operationsDir, 'context.json');
}

export function readOperationContext(root: string): KitOperationContextV1 | null
{
    const file = contextFile(root);

    if (!existsSync(file))
    {
        return null;
    }

    try
    {
        const parsed = JSON.parse(readFileSync(file, 'utf8'));

        return parsed?.schemaVersion === 1 && typeof parsed.operationId === 'string' ? parsed : null;
    }
    catch
    {
        return null;
    }
}

export function writeOperationContext(root: string, context: KitOperationContextV1): void
{
    const file = contextFile(root);

    mkdirSync(dirname(file), { recursive: true });

    const temporary = `${file}.tmp`;

    writeFileSync(temporary, `${JSON.stringify(context, null, 4)}\n`, 'utf8');
    renameSync(temporary, file);
}

export function clearOperationContext(root: string): void
{
    rmSync(contextFile(root), { force: true });
}
