import { describe, expect, it } from 'vitest';

import { getRunScriptArgs } from '../package-manager.js';

describe('getRunScriptArgs', () =>
{
    it('separates the script arguments with `--` on npm, which would otherwise read them as its own config', () =>
    {
        expect(getRunScriptArgs('npm', 'spfn:next', ['--port', '3790']))
            .toEqual(['run', 'spfn:next', '--', '--port', '3790']);
    });

    it('passes the arguments straight through on pnpm', () =>
    {
        expect(getRunScriptArgs('pnpm', 'spfn:next', ['--port', '3790']))
            .toEqual(['run', 'spfn:next', '--port', '3790']);
    });

    it('passes the arguments straight through on yarn', () =>
    {
        expect(getRunScriptArgs('yarn', 'spfn:next', ['--port', '3790']))
            .toEqual(['run', 'spfn:next', '--port', '3790']);
    });

    it('passes the arguments straight through on bun', () =>
    {
        expect(getRunScriptArgs('bun', 'spfn:next', ['--port', '3790']))
            .toEqual(['run', 'spfn:next', '--port', '3790']);
    });

    it('never emits a literal `--` on pnpm, which forwards it to the script and makes next read `--port` as a directory', () =>
    {
        expect(getRunScriptArgs('pnpm', 'spfn:next', ['--port', '3790']))
            .not.toContain('--');
    });
});
