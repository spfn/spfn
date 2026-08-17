/**
 * Which addresses a command talks to, and in which order that is decided.
 *
 * The order is the security property: a checkout that was activated against one
 * control plane must keep talking to that one, whatever a shell variable says.
 * Environment overrides exist for a staging or local run of a project that has
 * not been activated yet, and the published defaults are the last word.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    CONTROL_PLANE_URL_ENV,
    DEFAULT_CONTROL_PLANE_URL,
    DEFAULT_REGISTRY_URL,
    REGISTRY_URL_ENV,
    kitPackageName,
    resolveKitEndpoints,
} from '../../src/kit/http/index.js';

let root: string;

beforeEach(() =>
{
    root = mkdtempSync(join(tmpdir(), 'spfn-kit-endpoints-'));
});

afterEach(() =>
{
    rmSync(root, { recursive: true, force: true });
});

function writeLicense(fields: Record<string, unknown>): void
{
    mkdirSync(join(root, '.spfn'), { recursive: true });
    writeFileSync(join(root, '.spfn', 'license.json'), JSON.stringify({
        schemaVersion: 1,
        kitId: 'campaign-landing',
        activationId: 'a1b2c3d4e5f60718',
        localClientId: 'lc-1',
        installationId: 'op-1',
        ...fields,
    }), 'utf8');
}

describe('resolving a project\'s Kit endpoints', () =>
{
    it('uses what the checkout recorded when it was activated', () =>
    {
        writeLicense({
            controlPlaneUrl: 'https://staging.superfunction.xyz',
            registryUrl: 'https://staging.superfunction.xyz/npm/',
        });

        expect(resolveKitEndpoints(root, { [CONTROL_PLANE_URL_ENV]: 'https://elsewhere.example' })).toEqual({
            controlPlaneUrl: 'https://staging.superfunction.xyz',
            registryUrl: 'https://staging.superfunction.xyz/npm/',
            source: 'checkout',
        });
    });

    it('falls through to the environment for a project with no activation yet', () =>
    {
        expect(resolveKitEndpoints(root, {
            [CONTROL_PLANE_URL_ENV]: 'http://127.0.0.1:8790',
            [REGISTRY_URL_ENV]: 'http://127.0.0.1:8790/npm/',
        })).toEqual({
            controlPlaneUrl: 'http://127.0.0.1:8790',
            registryUrl: 'http://127.0.0.1:8790/npm/',
            source: 'environment',
        });
    });

    it('uses the published addresses when nothing says otherwise', () =>
    {
        expect(resolveKitEndpoints(root, {})).toEqual({
            controlPlaneUrl: DEFAULT_CONTROL_PLANE_URL,
            registryUrl: DEFAULT_REGISTRY_URL,
            source: 'default',
        });
    });

    it('ignores a licence file that names no addresses at all', () =>
    {
        writeLicense({});

        expect(resolveKitEndpoints(root, {}).source).toBe('default');
    });

    it('names the package a Kit ships as', () =>
    {
        expect(kitPackageName('campaign-landing')).toBe('@superfunction/campaign-landing');
    });
});
