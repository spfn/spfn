/**
 * What `spfn add vercel` writes into the project, and what it tells the operator
 * to put in Vercel's own environment.
 *
 * The split between the two is the point. pnpm 10 and later refuse to expand an
 * environment variable in a registry credential that came from a project
 * `.npmrc` — the file is committed, and a hostile edit could redirect the secret
 * to a registry the operator never chose. The credential is dropped with a
 * warning and the install fails as unauthorized, which is a silent failure for
 * anyone who does not read build logs closely.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { describe, expect, it } from 'vitest';
import { registryEnvValue } from '../add-vercel.js';

const templatesDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'templates', 'vercel');
const projectNpmrc = readFileSync(join(templatesDir, 'npmrc'), 'utf8');

describe('the .npmrc written into the project', () =>
{
    it('carries no credential in any spelling', () =>
    {
        expect(projectNpmrc).not.toMatch(/_auth/i);
        expect(projectNpmrc).not.toContain('${');
    });

    it('still names the registry every private scope resolves to', () =>
    {
        expect(projectNpmrc).toContain('@spfn:registry=https://git.superfunction.xyz/api/packages/superfunction/npm/');
    });
});

describe('registryEnvValue', () =>
{
    const value = registryEnvValue(templatesDir);

    it('carries the credential Vercel expands from the environment', () =>
    {
        expect(value).toContain('//git.superfunction.xyz/api/packages/superfunction/npm/:_authToken=${GITEA_NPM_TOKEN}');
    });

    it('keeps the auth key trailing slash that makes npm match it to the registry', () =>
    {
        const authLine = value.split('\n').find(line => line.includes(':_authToken')) ?? '';

        expect(authLine.startsWith('//git.superfunction.xyz/api/packages/superfunction/npm/:')).toBe(true);
    });

    it('repeats the project file\'s scope lines rather than restating them', () =>
    {
        for (const line of projectNpmrc.trim().split('\n'))
        {
            expect(value).toContain(line);
        }
    });

    it('names the public registry, because it replaces the whole user-level file', () =>
    {
        expect(value.split('\n')[0]).toBe('registry=https://registry.npmjs.org/');
    });
});
