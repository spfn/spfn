/**
 * The exported contract bundle must describe the server that is actually here.
 *
 * Two failure modes get closed:
 *
 * 1. **The committed export drifts from the assembler.** Someone edits
 *    `contracts/mobile/*.json` by hand, or changes a source module without
 *    re-exporting. The first block regenerates and compares bytes.
 * 2. **The assembler's declarations drift from the runtime.** Type shapes,
 *    error statuses and wire headers are declared in `contract-bundle.ts`, not
 *    derived from the decoders and encoders. The rest of this file exercises
 *    the real decoders/encoders against every declaration, so a declaration
 *    that stops describing the server fails here.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CLIENT_PROOF_CONTENT_TYPE, CLIENT_PROOF_HEADERS } from '../admission';
import type { CanonicalValue } from '../canonical-json';
import {
    BUNDLE_FILENAME,
    buildMobileContractBundle,
    PROVENANCE_FILENAME,
    renderMobileContractExport,
} from '../contract-bundle';
import {
    CONTRACT_OPERATIONS,
    ContractTypeError,
    decodeEchoRequest,
    decodeHandshakeRequest,
    decodeListItemsRequest,
    encodeEchoResponse,
    encodeHandshakeResponse,
    encodeListItemsResponse,
} from '../contract-types';
import { ClientProofRefusal, type ClientProofErrorCode } from '../refusal';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..');
const exportDir = join(repoRoot, 'contracts', 'mobile');

const bundle = buildMobileContractBundle();

interface FieldShape { name: string; type: string; optional: boolean }

interface TypeShape { name: string; fields: FieldShape[] }

const declaredTypes = bundle.types as TypeShape[];

function typeNamed(name: string): TypeShape
{
    const found = declaredTypes.find((type) => type.name === name);
    if (found === undefined)
    {
        throw new Error(`the bundle declares no type named ${name}`);
    }

    return found;
}

/** A canonical object carrying one value per declared field. */
function sampleOf(typeName: string, only?: (field: FieldShape) => boolean): Map<string, CanonicalValue>
{
    const members = new Map<string, CanonicalValue>();
    for (const field of typeNamed(typeName).fields)
    {
        if (only !== undefined && !only(field))
        {
            continue;
        }
        members.set(field.name, field.type === 'integer' ? 1n : 'x');
    }

    return members;
}

const DECODERS: Record<string, (value: CanonicalValue) => unknown> = {
    HandshakeRequest: decodeHandshakeRequest,
    EchoRequest: decodeEchoRequest,
    ListItemsRequest: decodeListItemsRequest,
};

describe('the committed export matches the assembler', () =>
{
    const rendered = renderMobileContractExport();

    it('bundle bytes are what the assembler produces', () =>
    {
        expect(readFileSync(join(exportDir, BUNDLE_FILENAME), 'utf8')).toBe(rendered.bundle);
    });

    it('provenance bytes are what the assembler produces', () =>
    {
        expect(readFileSync(join(exportDir, PROVENANCE_FILENAME), 'utf8')).toBe(rendered.provenance);
    });

    it('the provenance digest is the real digest of the committed bundle', () =>
    {
        const provenance = JSON.parse(readFileSync(join(exportDir, PROVENANCE_FILENAME), 'utf8'));
        expect(provenance.contract.bundleSha256).toBe(rendered.bundleSha256);
    });

    it('serialization is stable across runs', () =>
    {
        expect(renderMobileContractExport().bundle).toBe(rendered.bundle);
    });

    it('spfn-mobile validate.sh finds the allowlist line it greps for', () =>
    {
        expect(rendered.bundle).toContain('"allowed": ["clientProofV1"]');
    });
});

describe('operations describe the routes the server answers', () =>
{
    it('the bundle carries exactly the implemented operations', () =>
    {
        expect(bundle.operations).toEqual(CONTRACT_OPERATIONS.map((operation) => ({ ...operation })));
    });

    it('every operation names types the bundle declares', () =>
    {
        for (const operation of CONTRACT_OPERATIONS)
        {
            expect(declaredTypes.map((type) => type.name)).toContain(operation.requestType);
            expect(declaredTypes.map((type) => type.name)).toContain(operation.responseType);
        }
    });
});

describe('every declared field type is inside the grammar the consumer parses', () =>
{
    // spfn-mobile's FieldType.parse recognises `array<…>` and treats anything
    // else as a named type. `Item[]` therefore becomes a type named "Item[]"
    // and breaks at compile time, not at parse time — which is exactly how it
    // reached a published bundle once. These assertions are that slip's fence.
    const SCALARS = ['string', 'integer'];
    const declaredNames = declaredTypes.map((type) => type.name);

    function resolvable(type: string): boolean
    {
        if (SCALARS.includes(type))
        {
            return true;
        }
        if (type.startsWith('array<') && type.endsWith('>'))
        {
            return resolvable(type.slice('array<'.length, -1));
        }

        return declaredNames.includes(type);
    }

    it('the grammar the bundle states is the one these types are written in', () =>
    {
        expect((bundle.typeGrammar as { scalars: string[] }).scalars).toEqual(SCALARS);
    });

    it('no field uses a bracket array spelling', () =>
    {
        for (const type of declaredTypes)
        {
            for (const field of type.fields)
            {
                expect(field.type, `${type.name}.${field.name}`).not.toMatch(/\[\]$/);
            }
        }
    });

    it('every field type resolves to a scalar, an array of one, or a declared type', () =>
    {
        for (const type of declaredTypes)
        {
            for (const field of type.fields)
            {
                expect(resolvable(field.type), `${type.name}.${field.name} is "${field.type}"`).toBe(true);
            }
        }
    });
});

describe('declared request types match the decoders', () =>
{
    for (const [typeName, decode] of Object.entries(DECODERS))
    {
        it(`${typeName}: a value with every declared field decodes`, () =>
        {
            expect(() => decode(sampleOf(typeName))).not.toThrow();
        });

        it(`${typeName}: dropping a required field is refused`, () =>
        {
            for (const field of typeNamed(typeName).fields.filter((f) => !f.optional))
            {
                const value = sampleOf(typeName);
                value.delete(field.name);
                expect(() => decode(value), `${field.name} must be required`).toThrow(ContractTypeError);
            }
        });

        it(`${typeName}: omitting the optional fields still decodes`, () =>
        {
            expect(() => decode(sampleOf(typeName, (field) => !field.optional))).not.toThrow();
        });

        it(`${typeName}: a field the type does not declare is refused`, () =>
        {
            const value = sampleOf(typeName);
            value.set('fieldTheContractNeverDeclared', 'x');
            expect(() => decode(value)).toThrow(ContractTypeError);
        });

        it(`${typeName}: a declared integer will not accept a string`, () =>
        {
            for (const field of typeNamed(typeName).fields.filter((f) => f.type === 'integer'))
            {
                const value = sampleOf(typeName);
                value.set(field.name, 'not an integer');
                expect(() => decode(value), `${field.name} must be an integer`).toThrow(ContractTypeError);
            }
        });
    }
});

describe('declared response types match the encoders', () =>
{
    function keysOf(encoded: CanonicalValue): string[]
    {
        if (!(encoded instanceof Map))
        {
            throw new Error('an encoder produced something other than an object');
        }

        return [...encoded.keys()];
    }

    function requiredNames(typeName: string): string[]
    {
        return typeNamed(typeName).fields.filter((field) => !field.optional).map((field) => field.name);
    }

    function allNames(typeName: string): string[]
    {
        return typeNamed(typeName).fields.map((field) => field.name);
    }

    it('HandshakeResponse', () =>
    {
        expect(keysOf(encodeHandshakeResponse('s', 1n))).toEqual(allNames('HandshakeResponse'));
    });

    it('EchoResponse', () =>
    {
        expect(keysOf(encodeEchoResponse('m', 1n, 2n))).toEqual(allNames('EchoResponse'));
    });

    it('ListItemsResponse carries only the required fields when the cursor is absent', () =>
    {
        expect(keysOf(encodeListItemsResponse([], null))).toEqual(requiredNames('ListItemsResponse'));
    });

    it('ListItemsResponse carries the optional cursor when there is one', () =>
    {
        expect(keysOf(encodeListItemsResponse([], 'next'))).toEqual(allNames('ListItemsResponse'));
    });

    it('Item matches what the list encoder emits per element', () =>
    {
        const encoded = encodeListItemsResponse([{ id: 'a', name: 'b', updatedAtMillis: 1n }], null);
        const items = (encoded as Map<string, CanonicalValue>).get('items');
        expect(keysOf((items as CanonicalValue[])[0])).toEqual(allNames('Item'));
    });
});

describe('declared errors match the refusals', () =>
{
    const REFUSALS: Record<ClientProofErrorCode, () => ClientProofRefusal> = {
        PROOF_INVALID: () => ClientProofRefusal.proofInvalid(),
        PROOF_REPLAYED: () => ClientProofRefusal.proofReplayed(),
        PROOF_EXPIRED: () => ClientProofRefusal.proofExpired(),
        SESSION_REVOKED: () => ClientProofRefusal.sessionRevoked(),
        PROFILE_REJECTED: () => ClientProofRefusal.profileRejected(),
        CONTRACT_UNSUPPORTED: () => ClientProofRefusal.unroutable(),
    };

    const declared = bundle.errors as { code: ClientProofErrorCode; httpStatus: number }[];

    it('the bundle declares every code the server can answer with, and no other', () =>
    {
        expect(declared.map((error) => error.code).sort()).toEqual(Object.keys(REFUSALS).sort());
    });

    it('every declared status is the status that code actually answers with', () =>
    {
        for (const error of declared)
        {
            expect(REFUSALS[error.code]().httpStatus, error.code).toBe(error.httpStatus);
        }
    });
});

describe('declared wire mapping matches the reader', () =>
{
    const wire = bundle.wireMapping as { headers: Record<string, string>; headerOrder: string[]; requestContentType: string };

    it('header names are the ones admission reads', () =>
    {
        expect(wire.headers).toEqual({ ...CLIENT_PROOF_HEADERS });
    });

    it('headerOrder names every mapped field exactly once', () =>
    {
        expect([...wire.headerOrder].sort()).toEqual(Object.keys(CLIENT_PROOF_HEADERS).sort());
    });

    it('the content type is the one admission requires', () =>
    {
        expect(wire.requestContentType).toBe(CLIENT_PROOF_CONTENT_TYPE);
    });
});

describe('declared proof rules match the implementation', () =>
{
    const profile = bundle.clientProofV1 as { proofInput: { fields: string[]; separator: string }; replayWindowMillis: number };

    it('the proof-input field list is the one the MAC is taken over', async () =>
    {
        const { PROOF_INPUT_FIELDS, PROOF_INPUT_SEPARATOR } = await import('../proof');
        expect(profile.proofInput.fields).toEqual([...PROOF_INPUT_FIELDS]);
        expect(profile.proofInput.separator).toBe(PROOF_INPUT_SEPARATOR);
    });

    it('the replay window is the implemented default', async () =>
    {
        const { DEFAULT_REPLAY_WINDOW_MILLIS } = await import('../proof');
        expect(profile.replayWindowMillis).toBe(DEFAULT_REPLAY_WINDOW_MILLIS);
    });
});
