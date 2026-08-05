/**
 * The version announcement, and what the server does with what a client says.
 *
 * The cases are the cross of client kind against what the client stated: an app
 * kind must state a contract version this server serves, `web` states none by
 * construction, and something that names no kind is not a deployed client.
 */
import { describe, expect, it } from 'vitest';

import { CONTRACT_SUPPORTED_RANGE, CONTRACT_VERSION } from '../contract-bundle';
import {
    applyServerContractHeaders,
    CLIENT_IDENTITY_HEADERS,
    isContractVersionSupported,
    judgeClientIdentity,
    readClientIdentity,
    SERVER_CONTRACT_HEADERS,
    serverContractHeaders,
} from '../wire-version';

function request(fields: Record<string, string>): Headers
{
    return new Headers(fields);
}

describe('reading what a client says about itself', () =>
{
    it('reads the three fields of a mobile client', () =>
    {
        const identity = readClientIdentity(request({
            [CLIENT_IDENTITY_HEADERS.kind]: 'ios',
            [CLIENT_IDENTITY_HEADERS.version]: '3.1.4',
            [CLIENT_IDENTITY_HEADERS.contractVersion]: CONTRACT_VERSION,
        }));

        expect(identity).toEqual({ kind: 'ios', version: '3.1.4', contractVersion: CONTRACT_VERSION });
    });

    it('reads a web client, which states no contract version', () =>
    {
        const identity = readClientIdentity(request({
            [CLIENT_IDENTITY_HEADERS.kind]: 'web',
            [CLIENT_IDENTITY_HEADERS.version]: 'build-8812',
        }));

        expect(identity).toEqual({ kind: 'web', version: 'build-8812', contractVersion: null });
    });

    it('reads nothing from a request that names no kind', () =>
    {
        expect(readClientIdentity(request({}))).toBeNull();
    });

    it('reads nothing from a kind it does not recognise', () =>
    {
        expect(readClientIdentity(request({ [CLIENT_IDENTITY_HEADERS.kind]: 'toaster' }))).toBeNull();
    });
});

describe('whether the server serves a stated contract version', () =>
{
    it('serves its own version', () =>
    {
        expect(isContractVersionSupported(CONTRACT_VERSION)).toBe(true);
    });

    // 버전 문자열을 그대로 적으면 CONTRACT_VERSION이 오를 때마다 이 검사들이
    // 조용히 뒤집힌다. #70에서 범위 검사를 minor 규칙에서 유도하도록 고친 것과
    // 같은 이유로, 이웃 버전도 지금 버전에서 계산한다.
    const [major, minor] = CONTRACT_VERSION.split('.').map(Number);

    it('serves a different patch of the same minor', () =>
    {
        expect(isContractVersionSupported(`${major}.${minor}.99`)).toBe(true);
    });

    it('does not serve a different minor while the line is 0.x', () =>
    {
        expect(isContractVersionSupported(`${major}.${minor - 1}.0`)).toBe(false);
        expect(isContractVersionSupported(`${major}.${minor + 1}.0`)).toBe(false);
    });

    it('does not serve a different major', () =>
    {
        expect(isContractVersionSupported(`${major + 1}.${minor}.0`)).toBe(false);
    });

    it('does not serve something that is not a version', () =>
    {
        expect(isContractVersionSupported('latest')).toBe(false);
        expect(isContractVersionSupported(`${major}.${minor}`)).toBe(false);
        expect(isContractVersionSupported('')).toBe(false);
    });

    it('agrees with the range the server publishes', () =>
    {
        // The comparison is the rule the range spells out; a change to one
        // without the other would let the server refuse what it advertises.
        //
        // 0.x에서 breaking을 나르는 건 minor다. 그래서 범위의 바닥은 지금 버전이
        // 아니라 그 minor의 .0 이다 — 0.6.0 -> 0.6.1 같은 patch는 0.6.0으로 생성된
        // 소비자가 새로 알아야 할 게 없으므로 바닥을 그 위로 밀면 안 된다.
        expect(CONTRACT_SUPPORTED_RANGE).toBe(`>=${major}.${minor}.0 <${major}.${minor + 1}.0`);
    });

    it('serves the floor of the range it publishes, and nothing at its ceiling', () =>
    {
        const match = /^>=(\d+\.\d+\.\d+) <(\d+\.\d+\.\d+)$/.exec(CONTRACT_SUPPORTED_RANGE);

        expect(match).not.toBeNull();
        expect(isContractVersionSupported((match as RegExpExecArray)[1])).toBe(true);
        expect(isContractVersionSupported((match as RegExpExecArray)[2])).toBe(false);
    });
});

describe('the verdict on one request', () =>
{
    it('admits an app on a version the server serves', () =>
    {
        const identity = { kind: 'android' as const, version: '1.0.0', contractVersion: CONTRACT_VERSION };

        expect(judgeClientIdentity(identity)).toBeNull();
    });

    it('refuses an app that states no contract version', () =>
    {
        const refusal = judgeClientIdentity({ kind: 'ios', version: '1.0.0', contractVersion: null });

        expect(refusal?.code).toBe('CONTRACT_UNSUPPORTED');
        expect(refusal?.httpStatus).toBe(409);
    });

    it('refuses an app on a version the server does not serve', () =>
    {
        const refusal = judgeClientIdentity({ kind: 'ios', version: '1.0.0', contractVersion: '0.4.0' });

        expect(refusal?.code).toBe('CONTRACT_UNSUPPORTED');
    });

    it('admits web, which has no second version to reconcile', () =>
    {
        expect(judgeClientIdentity({ kind: 'web', version: 'build-1', contractVersion: null })).toBeNull();
    });

    it('admits a caller that is not a deployed client at all', () =>
    {
        expect(judgeClientIdentity(null)).toBeNull();
    });

    it('says nothing about what the client should do next', () =>
    {
        const refusal = judgeClientIdentity({ kind: 'ios', version: '1.0.0', contractVersion: '0.4.0' });

        // The server states the disagreement. Deciding that a user should be
        // shown an update prompt is the client's judgment, made in the client.
        expect(refusal?.message).not.toMatch(/update/i);
    });
});

describe('what the server announces', () =>
{
    it('states its version and range on a Headers object', () =>
    {
        const headers = new Headers();
        applyServerContractHeaders(headers);

        expect(headers.get(SERVER_CONTRACT_HEADERS.version)).toBe(CONTRACT_VERSION);
        expect(headers.get(SERVER_CONTRACT_HEADERS.supportedRange)).toBe(CONTRACT_SUPPORTED_RANGE);
    });

    it('states the same thing as a plain object', () =>
    {
        expect(serverContractHeaders()).toEqual({
            [SERVER_CONTRACT_HEADERS.version]: CONTRACT_VERSION,
            [SERVER_CONTRACT_HEADERS.supportedRange]: CONTRACT_SUPPORTED_RANGE,
        });
    });

    it('names the response headers apart from the request ones', () =>
    {
        // A proxy that echoes a request header into the response would otherwise
        // make the client's own version look like the server's.
        const requestNames = Object.values(CLIENT_IDENTITY_HEADERS);

        for (const name of Object.values(SERVER_CONTRACT_HEADERS))
        {
            expect(requestNames).not.toContain(name);
        }
    });
});
