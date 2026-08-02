/**
 * Cross-implementation conformance: the vendored spfn-mobile fixtures run
 * against this server's canonical JSON, proof assembly, admission order and
 * error envelope. Expected values were derived by an implementation
 * independent of both SDKs and of this server — agreement here is the
 * cross-implementation evidence issue #46 asks for.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
    CanonicalJsonError,
    encodeCanonicalJson,
    parseCanonicalJson,
} from '../canonical-json';
import {
    canonicalProofInput,
    computeClientProof,
    ProofInputError,
    sha256Hex,
    type ClientProofInput,
} from '../proof';
import { ClientProofRefusal, type ClientProofErrorCode } from '../refusal';
import { ClientProofState, TestClock } from '../state';
import {
    decodeEchoRequest,
    decodeHandshakeRequest,
    decodeListItemsRequest,
} from '../contract-types';

const FIXTURES = join(__dirname, 'fixtures');

function fixtureBytes(relative: string): Buffer
{
    return readFileSync(join(FIXTURES, relative));
}

function fixture<T>(relative: string): T
{
    return JSON.parse(fixtureBytes(relative).toString('utf8')) as T;
}

function hexSha256(bytes: Uint8Array): string
{
    return createHash('sha256').update(bytes).digest('hex');
}

const utf8 = new TextEncoder();

// ---------------------------------------------------------------------------

describe('vendored fixture integrity', () =>
{
    interface Manifest
    {
        bundleSha256: string;
        fixtures: { path: string; sha256: string; bytes: number }[];
    }

    it('every fixture file matches the upstream manifest digest', () =>
    {
        const manifest = fixture<Manifest>('MANIFEST.json');
        expect(manifest.fixtures).toHaveLength(9);
        for (const entry of manifest.fixtures)
        {
            const local = entry.path.replace('Contracts/fixtures/', '');
            const bytes = fixtureBytes(local);
            expect(bytes.length, entry.path).toBe(entry.bytes);
            expect(hexSha256(bytes), entry.path).toBe(entry.sha256);
        }
    });
});

// ---------------------------------------------------------------------------

describe('SPFN-CANON-JSON-1 conformance', () =>
{
    interface SerializationVector
    {
        name: string;
        input: string;
        canonical: string;
        sha256: string;
    }

    interface RejectVector
    {
        name: string;
        input: string;
        errorCode: string;
    }

    const serialization = fixture<{ vectors: SerializationVector[] }>('canonical/serialization.json');
    const rejects = fixture<{ vectors: RejectVector[] }>('canonical/rejects.json');

    it.each(serialization.vectors.map((v) => [v.name, v] as const))('serializes %s', (_, vector) =>
    {
        const value = parseCanonicalJson(utf8.encode(vector.input));
        const encoded = encodeCanonicalJson(value);
        expect(Buffer.from(encoded).toString('utf8')).toBe(vector.canonical);
        expect(hexSha256(encoded)).toBe(vector.sha256);
    });

    it.each(rejects.vectors.map((v) => [v.name, v] as const))('rejects %s', (_, vector) =>
    {
        try
        {
            parseCanonicalJson(utf8.encode(vector.input));
            expect.unreachable(`expected ${vector.errorCode}`);
        }
        catch (error)
        {
            expect(error).toBeInstanceOf(CanonicalJsonError);
            expect((error as CanonicalJsonError).code).toBe(vector.errorCode);
        }
    });
});

// ---------------------------------------------------------------------------

interface ProofFixtureInput
{
    method: string;
    path: string;
    clientId: string;
    keyId: string;
    nonce: string;
    issuedAtMillis: number;
    bodySha256: string;
}

function toProofInput(input: ProofFixtureInput): ClientProofInput
{
    return {
        method: input.method,
        path: input.path,
        clientId: input.clientId,
        keyId: input.keyId,
        nonce: input.nonce,
        issuedAtMillis: BigInt(input.issuedAtMillis),
        bodySha256: input.bodySha256,
    };
}

describe('SPFN-PROOF-INPUT-1 conformance', () =>
{
    interface ProofVector
    {
        name: string;
        input: ProofFixtureInput;
        canonicalString: string;
        canonicalSha256: string;
        proofHmacSha256: string;
    }

    const proofFixture = fixture<{
        syntheticKey: { keyUtf8: string };
        vectors: ProofVector[];
    }>('proof/proof-input.json');
    const key = utf8.encode(proofFixture.syntheticKey.keyUtf8);

    it.each(proofFixture.vectors.map((v) => [v.name, v] as const))('assembles and signs %s', (_, vector) =>
    {
        const input = toProofInput(vector.input);
        const canonical = canonicalProofInput(input);
        expect(canonical).toBe(vector.canonicalString);
        expect(sha256Hex(utf8.encode(canonical))).toBe(vector.canonicalSha256);
        expect(computeClientProof(input, key)).toBe(vector.proofHmacSha256);
    });

    interface ProofRejectVector
    {
        name: string;
        input: ProofFixtureInput;
        errorCode: string;
    }

    const proofRejects = fixture<{ vectors: ProofRejectVector[] }>('proof/rejects.json');

    it.each(proofRejects.vectors.map((v) => [v.name, v] as const))('refuses %s', (_, vector) =>
    {
        expect(vector.errorCode).toBe('PROOF_INPUT_INVALID');
        expect(() => canonicalProofInput(toProofInput(vector.input))).toThrow(ProofInputError);
    });
});

// ---------------------------------------------------------------------------

interface AdmissionStep
{
    nonce: string;
    issuedAtMillis: number;
    nowMillis: number;
    proof: string;
    expect: string;
}

interface AdmissionBase
{
    method: string;
    path: string;
    clientId: string;
    keyId: string;
    bodySha256: string;
}

const SYNTHETIC_KEYS = { 'key-test-0001': 'spfn-test-key-not-a-secret-0001' };

function runAdmissionSteps(
    base: AdmissionBase,
    steps: AdmissionStep[],
    replayWindowMillis: number,
    revokedKeyIds: string[] = [],
): void
{
    const clock = new TestClock(steps[0].nowMillis);
    const state = new ClientProofState({ keys: SYNTHETIC_KEYS, clock, replayWindowMillis });
    for (const keyId of revokedKeyIds)
    {
        state.revokeKey(keyId);
    }
    for (const step of steps)
    {
        clock.advance(step.nowMillis - clock.nowMillis());
        const refusal = state.admit({
            clientId: base.clientId,
            keyId: base.keyId,
            presentedSessionId: null,
            requiresSession: false,
            proofInput: {
                method: base.method,
                path: base.path,
                clientId: base.clientId,
                keyId: base.keyId,
                nonce: step.nonce,
                issuedAtMillis: BigInt(step.issuedAtMillis),
                bodySha256: base.bodySha256,
            },
            presentedProof: step.proof,
        });
        if (step.expect === 'accept')
        {
            expect(refusal, step.nonce).toBeNull();
        }
        else
        {
            expect(refusal, step.nonce).not.toBeNull();
            expect(refusal!.code, step.nonce).toBe(step.expect as ClientProofErrorCode);
        }
    }
}

describe('replay-window conformance', () =>
{
    interface ReplayFixture
    {
        replayWindowMillis: number;
        base: AdmissionBase;
        vectors: { name: string; steps: AdmissionStep[] }[];
    }

    const replay = fixture<ReplayFixture>('replay/replay.json');

    it.each(replay.vectors.map((v) => [v.name, v] as const))('%s', (_, vector) =>
    {
        runAdmissionSteps(replay.base, vector.steps, replay.replayWindowMillis);
    });
});

describe('revocation conformance', () =>
{
    interface RevokeFixture
    {
        replayWindowMillis: number;
        base: AdmissionBase;
        vectors: { name: string; revokedKeyIds: string[]; steps: AdmissionStep[] }[];
    }

    const revoke = fixture<RevokeFixture>('revoke/revoke.json');

    it.each(revoke.vectors.map((v) => [v.name, v] as const))('%s', (_, vector) =>
    {
        runAdmissionSteps(revoke.base, vector.steps, revoke.replayWindowMillis, vector.revokedKeyIds);
    });
});

// ---------------------------------------------------------------------------

describe('error envelope conformance', () =>
{
    interface EnvelopeVector
    {
        name: string;
        wire: string;
        code: ClientProofErrorCode;
        httpStatus: number;
        sha256: string;
    }

    const envelopes = fixture<{ known: EnvelopeVector[] }>('error/envelopes.json');

    it.each(envelopes.known.map((v) => [v.name, v] as const))('encodes %s', (_, vector) =>
    {
        const parsed = JSON.parse(vector.wire) as { error: { message: string; requestId: string } };
        const refusal = new ClientProofRefusal(vector.code, parsed.error.message);
        expect(refusal.httpStatus).toBe(vector.httpStatus);
        const bytes = refusal.envelopeBytes(parsed.error.requestId);
        expect(Buffer.from(bytes).toString('utf8')).toBe(vector.wire);
        expect(hexSha256(bytes)).toBe(vector.sha256);
    });
});

// ---------------------------------------------------------------------------

describe('operation type conformance', () =>
{
    interface RequestVector
    {
        name: string;
        operationId: string;
        canonical: string;
        sha256: string;
    }

    interface ResponseVector
    {
        name: string;
        wire: string;
        canonical: string;
        sha256: string;
    }

    const operations = fixture<{ requests: RequestVector[]; responses: ResponseVector[] }>('request/operations.json');

    it.each(operations.requests.map((v) => [v.name, v] as const))('decodes request %s', (_, vector) =>
    {
        const bytes = utf8.encode(vector.canonical);
        expect(sha256Hex(bytes)).toBe(vector.sha256);
        const value = parseCanonicalJson(bytes);
        // Round-trips canonically and decodes as the declared type.
        expect(Buffer.from(encodeCanonicalJson(value)).toString('utf8')).toBe(vector.canonical);
        if (vector.operationId === 'auth.clientProof.handshake')
        {
            expect(() => decodeHandshakeRequest(value)).not.toThrow();
        }
        else if (vector.operationId === 'echo.send')
        {
            expect(() => decodeEchoRequest(value)).not.toThrow();
        }
        else
        {
            expect(() => decodeListItemsRequest(value)).not.toThrow();
        }
    });

    it.each(operations.responses.map((v) => [v.name, v] as const))('response wire form %s is canonical', (_, vector) =>
    {
        expect(vector.wire).toBe(vector.canonical);
        const value = parseCanonicalJson(utf8.encode(vector.wire));
        const encoded = encodeCanonicalJson(value);
        expect(Buffer.from(encoded).toString('utf8')).toBe(vector.canonical);
        expect(hexSha256(encoded)).toBe(vector.sha256);
    });
});
