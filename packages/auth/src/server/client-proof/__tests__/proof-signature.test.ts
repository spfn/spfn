/**
 * The asymmetric proof itself (contract 0.2.0): ECDSA P-256 signatures over
 * SPFN-PROOF-INPUT-1, raw r‖s base16-lower on the wire — acceptance,
 * tampering, wire-format violations (DER, wrong length, uppercase), key
 * registration, and the admission order staying exactly what 0.1.0 declared.
 */
import { createPrivateKey, sign } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
    canonicalProofInput,
    parseClientProofPublicKey,
    PROOF_SIGNATURE_HEX_LENGTH,
    ProofInputError,
    signClientProof,
    verifyClientProof,
    type ClientProofInput,
} from '../proof';
import { ClientProofState, TestClock } from '../state';
import {
    OTHER_PRIVATE_KEY_PKCS8_B64,
    TEST_CLIENT_ID,
    TEST_KEY_ID,
    TEST_PRIVATE_KEY_PKCS8_B64,
    TEST_PUBLIC_KEY_SPKI_B64,
    TEST_PUBLIC_KEYS,
} from './test-keys';

const NOW = 1_750_000_000_000;

const INPUT: ClientProofInput = {
    method: 'POST',
    path: '/v1/echo',
    clientId: TEST_CLIENT_ID,
    keyId: TEST_KEY_ID,
    nonce: 'nonce-sig-0001',
    issuedAtMillis: BigInt(NOW),
    bodySha256: '0'.repeat(64),
};

const PUBLIC_KEY = parseClientProofPublicKey(TEST_PUBLIC_KEY_SPKI_B64);

/** The same proof input signed as Java `Signature` would emit it: DER. */
function derProofHex(input: ClientProofInput): string
{
    const key = createPrivateKey({
        key: Buffer.from(TEST_PRIVATE_KEY_PKCS8_B64, 'base64'),
        format: 'der',
        type: 'pkcs8',
    });

    return sign(
        'sha256',
        Buffer.from(canonicalProofInput(input), 'utf8'),
        { key, dsaEncoding: 'der' },
    ).toString('hex');
}

describe('signature verification', () =>
{
    it('accepts a valid signature by the registered key', () =>
    {
        const proof = signClientProof(INPUT, TEST_PRIVATE_KEY_PKCS8_B64);
        expect(proof).toHaveLength(PROOF_SIGNATURE_HEX_LENGTH);
        expect(verifyClientProof(INPUT, proof, PUBLIC_KEY)).toBe(true);
    });

    it('rejects the signature once any proof-input field changes', () =>
    {
        const proof = signClientProof(INPUT, TEST_PRIVATE_KEY_PKCS8_B64);
        const tampered: ClientProofInput[] = [
            { ...INPUT, method: 'GET' },
            { ...INPUT, path: '/v1/items/list' },
            { ...INPUT, clientId: 'client-test-0002' },
            { ...INPUT, keyId: 'key-test-0002' },
            { ...INPUT, nonce: 'nonce-sig-0002' },
            { ...INPUT, issuedAtMillis: BigInt(NOW + 1) },
            { ...INPUT, bodySha256: '1'.repeat(64) },
        ];
        for (const input of tampered)
        {
            expect(verifyClientProof(input, proof, PUBLIC_KEY)).toBe(false);
        }
    });

    it('rejects a signature by a key other than the registered one', () =>
    {
        const proof = signClientProof(INPUT, OTHER_PRIVATE_KEY_PKCS8_B64);
        expect(verifyClientProof(INPUT, proof, PUBLIC_KEY)).toBe(false);
    });

    it('rejects a DER-encoded signature presented directly', () =>
    {
        // Valid cryptographically — the same key over the same input — but not
        // the wire encoding: DER is 140–144 hex chars, never 128.
        const der = derProofHex(INPUT);
        expect(der).not.toHaveLength(PROOF_SIGNATURE_HEX_LENGTH);
        expect(verifyClientProof(INPUT, der, PUBLIC_KEY)).toBe(false);
    });

    it('rejects every wrong length and non-base16-lower spelling', () =>
    {
        const proof = signClientProof(INPUT, TEST_PRIVATE_KEY_PKCS8_B64);
        expect(verifyClientProof(INPUT, proof.slice(0, 127), PUBLIC_KEY)).toBe(false);
        expect(verifyClientProof(INPUT, `${proof}00`, PUBLIC_KEY)).toBe(false);
        expect(verifyClientProof(INPUT, proof.toUpperCase(), PUBLIC_KEY)).toBe(false);
        expect(verifyClientProof(INPUT, '', PUBLIC_KEY)).toBe(false);
        expect(verifyClientProof(INPUT, 'z'.repeat(128), PUBLIC_KEY)).toBe(false);
    });

    it('a C0 control character in a field throws no matter what was presented', () =>
    {
        // An unassemblable input is a contract violation, never a proof
        // answer — even when the presented proof is malformed too, the input
        // is judged first (as the HMAC implementation always did).
        const bad = { ...INPUT, nonce: 'nonce\tsig-0001' };
        expect(() => verifyClientProof(bad, 'not-a-proof', PUBLIC_KEY)).toThrow(ProofInputError);
        expect(() => verifyClientProof(bad, signClientProof(INPUT, TEST_PRIVATE_KEY_PKCS8_B64), PUBLIC_KEY))
            .toThrow(ProofInputError);
    });
});

describe('public-key registration', () =>
{
    it('refuses a key that is not P-256 SPKI DER at parse time', () =>
    {
        expect(() => parseClientProofPublicKey('bm90IGEga2V5')).toThrow();
    });

    it('a proof under an unregistered keyId is PROOF_INVALID', () =>
    {
        const state = new ClientProofState({ publicKeys: {}, clock: new TestClock(NOW) });
        const refusal = state.admit({
            clientId: INPUT.clientId,
            keyId: INPUT.keyId,
            presentedSessionId: null,
            requiresSession: false,
            proofInput: INPUT,
            presentedProof: signClientProof(INPUT, TEST_PRIVATE_KEY_PKCS8_B64),
        });
        expect(refusal?.code).toBe('PROOF_INVALID');
    });

    it('registerPublicKey makes the same proof verifiable', () =>
    {
        const state = new ClientProofState({ publicKeys: {}, clock: new TestClock(NOW) });
        state.registerPublicKey(TEST_KEY_ID, TEST_PUBLIC_KEY_SPKI_B64);
        const refusal = state.admit({
            clientId: INPUT.clientId,
            keyId: INPUT.keyId,
            presentedSessionId: null,
            requiresSession: false,
            proofInput: INPUT,
            presentedProof: signClientProof(INPUT, TEST_PRIVATE_KEY_PKCS8_B64),
        });
        expect(refusal).toBeNull();
    });

    it('refuses registering a non-key at registration, not at request time', () =>
    {
        const state = new ClientProofState({ publicKeys: {}, clock: new TestClock(NOW) });
        expect(() => state.registerPublicKey(TEST_KEY_ID, 'bm90IGEga2V5')).toThrow();
    });
});

describe('admission order is unchanged by the asymmetric revision', () =>
{
    function admitWith(state: ClientProofState, input: ClientProofInput, proof: string)
    {
        return state.admit({
            clientId: input.clientId,
            keyId: input.keyId,
            presentedSessionId: null,
            requiresSession: false,
            proofInput: input,
            presentedProof: proof,
        });
    }

    it('a revoked key answers SESSION_REVOKED even with a valid signature', () =>
    {
        const state = new ClientProofState({ publicKeys: TEST_PUBLIC_KEYS, clock: new TestClock(NOW) });
        state.revokeKey(TEST_KEY_ID);
        const refusal = admitWith(state, INPUT, signClientProof(INPUT, TEST_PRIVATE_KEY_PKCS8_B64));
        expect(refusal?.code).toBe('SESSION_REVOKED');
    });

    it('expiry is decided before the signature is even looked at', () =>
    {
        const state = new ClientProofState({ publicKeys: TEST_PUBLIC_KEYS, clock: new TestClock(NOW + 300_001) });
        const refusal = admitWith(state, INPUT, signClientProof(INPUT, OTHER_PRIVATE_KEY_PKCS8_B64));
        expect(refusal?.code).toBe('PROOF_EXPIRED');
    });

    it.each([
        ['exact server time', 0, null],
        ['one millisecond in the future', -1, 'PROOF_EXPIRED'],
        ['replay-window lower boundary', 300_000, null],
        ['one millisecond beyond the replay window', 300_001, 'PROOF_EXPIRED'],
    ] as const)('%s has the contract admission result', (_, ageMillis, expectedCode) =>
    {
        const input = {
            ...INPUT,
            nonce: `nonce-boundary-${ageMillis}`,
            issuedAtMillis: BigInt(NOW - ageMillis),
        };
        const state = new ClientProofState({ publicKeys: TEST_PUBLIC_KEYS, clock: new TestClock(NOW) });
        const refusal = admitWith(state, input, signClientProof(input, TEST_PRIVATE_KEY_PKCS8_B64));

        expect(refusal?.code ?? null).toBe(expectedCode);
    });

    it('a future refusal does not spend the nonce before that timestamp becomes current', () =>
    {
        const clock = new TestClock(NOW);
        const state = new ClientProofState({ publicKeys: TEST_PUBLIC_KEYS, clock });
        const input = {
            ...INPUT,
            nonce: 'nonce-future-not-spent',
            issuedAtMillis: BigInt(NOW + 1),
        };
        const proof = signClientProof(input, TEST_PRIVATE_KEY_PKCS8_B64);

        expect(admitWith(state, input, proof)?.code).toBe('PROOF_EXPIRED');
        clock.advance(1);
        expect(admitWith(state, input, proof)).toBeNull();
    });

    it('a spent nonce answers PROOF_REPLAYED before the signature check', () =>
    {
        const state = new ClientProofState({ publicKeys: TEST_PUBLIC_KEYS, clock: new TestClock(NOW) });
        expect(admitWith(state, INPUT, signClientProof(INPUT, TEST_PRIVATE_KEY_PKCS8_B64))).toBeNull();
        const refusal = admitWith(state, INPUT, signClientProof(INPUT, OTHER_PRIVATE_KEY_PKCS8_B64));
        expect(refusal?.code).toBe('PROOF_REPLAYED');
    });

    it('only a request that clears every earlier gate reaches PROOF_INVALID', () =>
    {
        const state = new ClientProofState({ publicKeys: TEST_PUBLIC_KEYS, clock: new TestClock(NOW) });
        const refusal = admitWith(state, INPUT, signClientProof(INPUT, OTHER_PRIVATE_KEY_PKCS8_B64));
        expect(refusal?.code).toBe('PROOF_INVALID');
    });
});
