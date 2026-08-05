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
    CONTRACT_VERSION,
    PROVENANCE_FILENAME,
    renderMobileContractExport,
} from '../contract-bundle';
import { KEY_TTL_DAYS } from '../../lib/key-policy';
import {
    AUTH_SURFACE_OPERATIONS,
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
        members.set(field.name, sampleValueOf(field.type));
    }

    return members;
}

function sampleValueOf(type: string): CanonicalValue
{
    if (type === 'integer')
    {
        return 1n;
    }
    if (type === 'boolean')
    {
        return true;
    }

    return 'x';
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

    it('the decimal grammar reaches the committed file, not only the TypeScript comments', () =>
    {
        // A rule a consumer cannot read is not a declared rule. These four are
        // what the 0.7.0 grammar change promises, so they are asserted against the
        // bytes on disk rather than the assembled object.
        const committed = JSON.parse(readFileSync(join(exportDir, BUNDLE_FILENAME), 'utf8'));
        const grammar = committed.typeGrammar;

        expect(grammar.scalars).toEqual(['string', 'integer', 'boolean']);
        expect(grammar.decimal).toContain('decimal<scale>');
        expect(grammar.decimalScaleRule).toContain('breaking change');
        expect(grammar.decimalGeneratorRule).toContain('never rounded');
        expect(grammar).not.toHaveProperty('integerVersusNumber');
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
    const ALL_OPERATIONS = [...CONTRACT_OPERATIONS, ...AUTH_SURFACE_OPERATIONS];

    it('the bundle carries exactly the implemented operations', () =>
    {
        expect(bundle.operations).toEqual(ALL_OPERATIONS.map((operation) => ({ ...operation })));
    });

    it('every operation names types the bundle declares', () =>
    {
        for (const operation of ALL_OPERATIONS)
        {
            expect(declaredTypes.map((type) => type.name)).toContain(operation.requestType);
            expect(declaredTypes.map((type) => type.name)).toContain(operation.responseType);
        }
    });

    // I1 — the /_auth surface is exported as contract operations.
    it('I1: register, login, oauthNative and the key operations are exported', () =>
    {
        const byId = new Map(AUTH_SURFACE_OPERATIONS.map((operation) => [operation.id, operation]));
        expect(byId.get('auth.enroll.register')?.path).toBe('/_auth/register');
        expect(byId.get('auth.enroll.login')?.path).toBe('/_auth/login');
        expect(byId.get('auth.enroll.oauthNative')?.path).toBe('/_auth/oauth/{provider}/native');
        expect(byId.get('auth.keys.rotate')?.path).toBe('/_auth/keys/rotate');
        expect(byId.get('auth.keys.list')?.path).toBe('/_auth/keys/list');
        expect(byId.get('auth.keys.revoke')?.path).toBe('/_auth/keys/revoke');
        expect(byId.get('auth.keys.revokeAll')?.path).toBe('/_auth/keys/revoke-all');
    });

    // 서명은 본문 바이트를 덮는다. 주소에 값이 끼면 클라이언트와 서버가 같은 문자열을
    // 만들어야 하는데 그 정규화 규칙이 없다 — 그래서 모든 operation이 POST이고 인자는 본문에 있다.
    it('every operation is POST with its arguments in the body', () =>
    {
        for (const operation of [...CONTRACT_OPERATIONS, ...AUTH_SURFACE_OPERATIONS])
        {
            expect(operation.method).toBe('POST');
        }

        const proven = AUTH_SURFACE_OPERATIONS.filter(op => op.authProfile === 'clientProofV1');
        for (const operation of proven)
        {
            expect(operation.path).not.toMatch(/\{/);
        }
    });

    // 필드가 없는 타입은 소비자 codegen이 만들지 못한다 (Kotlin data class는 인자가 1개 이상).
    it('no declared type is empty — a consumer cannot generate one', () =>
    {
        for (const type of declaredTypes)
        {
            expect(type.fields.length).toBeGreaterThan(0);
        }
    });

    // I2 — the unproven class is stated, and covers exactly the enrollment ops.
    it('I2: exactly the three enrollment operations are the unproven class, and the bundle states it', () =>
    {
        const unproven = [...CONTRACT_OPERATIONS, ...AUTH_SURFACE_OPERATIONS]
            .filter((operation) => operation.authProfile === 'none')
            .map((operation) => operation.id)
            .sort();
        expect(unproven).toEqual(['auth.enroll.login', 'auth.enroll.oauthNative', 'auth.enroll.register']);

        const classes = bundle.operationAuthClasses as Record<string, string>;
        expect(classes.none).toContain('neither proof headers nor a session header');
        expect(classes.rule).toContain('refuses an unproven call');
    });

    // I2 — key rotation is not unproven: it requires an admitted proof.
    it('I2: keys/rotate is a proven operation', () =>
    {
        const rotate = AUTH_SURFACE_OPERATIONS.find((operation) => operation.id === 'auth.keys.rotate');
        expect(rotate?.authProfile).toBe('clientProofV1');
        expect(rotate?.requiresSession).toBe(false);
    });

    // I4 — the advertised TTL is the one the key service stamps.
    it('I4: keyPolicy states the 90-day TTL the key service actually applies', () =>
    {
        const keyPolicy = bundle.keyPolicy as { ttlDays: number; rotationOperation: string };
        expect(keyPolicy.ttlDays).toBe(KEY_TTL_DAYS);
        expect(keyPolicy.ttlDays).toBe(90);
        expect(keyPolicy.rotationOperation).toBe('auth.keys.rotate');
    });

    // I5 — the three dev operations survive the 0.3.0 export.
    it('I5: the dev operations are still exported, unchanged in id and path', () =>
    {
        const ids = CONTRACT_OPERATIONS.map((operation) => operation.id);
        expect(ids).toEqual(['auth.clientProof.handshake', 'echo.send', 'items.list']);
        for (const operation of CONTRACT_OPERATIONS)
        {
            expect(operation.authProfile).toBe('clientProofV1');
        }
    });
});

describe('every operation records when it became available', () =>
{
    interface AvailabilityShape
    {
        id: string;
        since: string;
        deprecatedIn?: string;
        removedIn?: string;
    }

    const operations = bundle.operations as AvailabilityShape[];

    /**
     * The first version of the surviving line. 1.0.0 and 1.0.1 were withdrawn and
     * renumbered into 0.1.0 (commit 50013456), so nothing predates it.
     */
    const EARLIEST_VERSION = '0.1.0';

    const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

    function ordinal(version: string): number
    {
        const match = SEMVER.exec(version);
        if (match === null)
        {
            throw new Error(`"${version}" is not a three-part version`);
        }

        return (Number(match[1]) * 1_000_000) + (Number(match[2]) * 1_000) + Number(match[3]);
    }

    /**
     * The version each operation first shipped in, read off this repository's own
     * history. Pinned here so a later edit cannot quietly move one: a `since` that
     * says a later version than the operation actually shipped in is a falsified
     * history nothing else in the suite would catch.
     *
     * | operation | first commit | version there |
     * | auth.clientProof.handshake, echo.send, items.list | 50013456 | 0.1.0 |
     * | auth.enroll.{register,login,oauthNative}, auth.keys.rotate | c041ef48 | 0.3.0 |
     * | auth.keys.{list,revoke,revokeAll} | ee286775 | 0.4.1 |
     */
    const RECORDED_HISTORY: Record<string, string> = {
        'auth.clientProof.handshake': '0.1.0',
        'echo.send': '0.1.0',
        'items.list': '0.1.0',
        'auth.enroll.register': '0.3.0',
        'auth.enroll.login': '0.3.0',
        'auth.enroll.oauthNative': '0.3.0',
        'auth.keys.rotate': '0.3.0',
        'auth.keys.list': '0.4.1',
        'auth.keys.revoke': '0.4.1',
        'auth.keys.revokeAll': '0.4.1',
    };

    it('every exported operation carries a since', () =>
    {
        for (const operation of operations)
        {
            expect(typeof operation.since, operation.id).toBe('string');
            expect(operation.since, operation.id).toMatch(SEMVER);
        }
    });

    it('no since is later than the version being published, or earlier than the line starts', () =>
    {
        for (const operation of operations)
        {
            expect(ordinal(operation.since), `${operation.id} is from the future`)
                .toBeLessThanOrEqual(ordinal(CONTRACT_VERSION));
            expect(ordinal(operation.since), `${operation.id} predates the line`)
                .toBeGreaterThanOrEqual(ordinal(EARLIEST_VERSION));
        }
    });

    it('the backfill is the history git records, operation by operation', () =>
    {
        expect(Object.fromEntries(operations.map((operation) => [operation.id, operation.since])))
            .toEqual(RECORDED_HISTORY);
    });

    it('nothing is deprecated or removed yet', () =>
    {
        for (const operation of operations)
        {
            expect(operation.deprecatedIn, operation.id).toBeUndefined();
            expect(operation.removedIn, operation.id).toBeUndefined();
        }
    });

    // 오늘은 비어 있는 필드지만, 검사는 지금 심어 둔다. 첫 deprecation이 들어오는
    // 커밋에서 순서를 확인할 사람이 없어도 이 케이스들이 대신 확인한다.
    it('a removal is never recorded without the deprecation that precedes it', () =>
    {
        for (const operation of operations)
        {
            if (operation.removedIn === undefined)
            {
                continue;
            }
            expect(operation.deprecatedIn, `${operation.id} is removed but never deprecated`).toBeDefined();
        }
    });

    it('since, deprecatedIn and removedIn run in that order', () =>
    {
        for (const operation of operations)
        {
            const since = ordinal(operation.since);

            if (operation.deprecatedIn !== undefined)
            {
                expect(operation.deprecatedIn, operation.id).toMatch(SEMVER);
                expect(ordinal(operation.deprecatedIn), `${operation.id} deprecated before it existed`)
                    .toBeGreaterThanOrEqual(since);
            }
            if (operation.removedIn !== undefined)
            {
                expect(operation.removedIn, operation.id).toMatch(SEMVER);
                expect(ordinal(operation.removedIn), `${operation.id} removed before it existed`)
                    .toBeGreaterThanOrEqual(since);
            }
            if (operation.deprecatedIn !== undefined && operation.removedIn !== undefined)
            {
                expect(ordinal(operation.removedIn), `${operation.id} removed before it was deprecated`)
                    .toBeGreaterThan(ordinal(operation.deprecatedIn));
            }
        }
    });

    it('the bundle says what the three fields mean and how a removal is announced', () =>
    {
        const availability = bundle.operationAvailability as Record<string, string>;

        expect(availability.since).toContain('first appeared in');
        expect(availability.deprecatedIn).toContain('still served');
        expect(availability.removedIn).toContain('leaves this list');
        expect(availability.procedure).toContain('mark then wait then remove');
    });

    it('the bundle states that under allOrNothing these fields decide nothing', () =>
    {
        const availability = bundle.operationAvailability as Record<string, string>;
        const policy = bundle.compatibilityPolicy as Record<string, string>;

        expect(availability.verdictRule).toContain('decide nothing');
        expect(availability.verdictRule).toContain('perOperation');
        expect(policy.availability).toContain('descriptive');
    });
});

describe('every declared field type is inside the grammar the consumer parses', () =>
{
    // spfn-mobile's FieldType.parse recognises `array<…>` and treats anything
    // else as a named type. `Item[]` therefore becomes a type named "Item[]"
    // and breaks at compile time, not at parse time — which is exactly how it
    // reached a published bundle once. These assertions are that slip's fence.
    const SCALARS = ['string', 'integer', 'boolean'];
    const MIN_DECIMAL_SCALE = 1;
    const MAX_DECIMAL_SCALE = 18;
    const declaredNames = declaredTypes.map((type) => type.name);
    const declaredEnums = (bundle.enums as { name: string; values: string[] }[]);

    function decimalScale(type: string): number | null
    {
        const match = /^decimal<(\d+)>$/.exec(type);

        return match === null ? null : Number(match[1]);
    }

    function resolvable(type: string): boolean
    {
        if (SCALARS.includes(type))
        {
            return true;
        }

        const scale = decimalScale(type);
        if (scale !== null)
        {
            return scale >= MIN_DECIMAL_SCALE && scale <= MAX_DECIMAL_SCALE;
        }
        if (type.startsWith('array<') && type.endsWith('>'))
        {
            return resolvable(type.slice('array<'.length, -1));
        }
        if (type.startsWith('map<string,') && type.endsWith('>'))
        {
            return resolvable(type.slice('map<string,'.length, -1));
        }

        return declaredNames.includes(type) || declaredEnums.some((declared) => declared.name === type);
    }

    it('the grammar the bundle states is the one these types are written in', () =>
    {
        expect((bundle.typeGrammar as { scalars: string[] }).scalars).toEqual(SCALARS);
    });

    it('the scalar list carries no floating-point type', () =>
    {
        // 0.7.0 removed `number`. The encoding never admitted one — canonical
        // JSON calls a fraction an error — so a grammar that kept offering it was
        // declaring a shape the server could not have written.
        const grammar = bundle.typeGrammar as Record<string, unknown>;

        expect(SCALARS).not.toContain('number');
        expect(grammar).not.toHaveProperty('integerVersusNumber');
        expect(JSON.stringify(grammar.scalars)).not.toContain('number');
    });

    it('the grammar states the decimal spelling and what its wire value means', () =>
    {
        const grammar = bundle.typeGrammar as Record<string, string>;

        expect(grammar.decimal).toContain('decimal<scale>');
        expect(grammar.decimal).toContain('integer divided by 10 to the scale');
        expect(grammar.decimal).toContain('only decimal spelling');
    });

    it('the grammar states the scale bounds that keep the wire value inside int64', () =>
    {
        // The wire value is a signed 64-bit integer, so the scale cannot run past
        // the largest power of ten one holds. Scale 0 is `integer` spelled the
        // long way and is not a scale at all.
        const grammar = bundle.typeGrammar as Record<string, string>;

        expect(grammar.decimal).toContain(`from ${MIN_DECIMAL_SCALE} to ${MAX_DECIMAL_SCALE}`);
        expect(grammar.decimal).toContain('Scale 0 is integer written the long way and is not a valid scale');
        expect(grammar.decimal).toContain('signed 64-bit integers only');
    });

    it('the grammar declares that a scale change is breaking and renames the field', () =>
    {
        // Promoted from the #95 decision: a scale is part of the type, so moving
        // it is a version bump, and the unit belongs in the name the way AtMillis
        // is in every moment's name.
        const grammar = bundle.typeGrammar as Record<string, string>;

        expect(grammar.decimalScaleRule).toContain('breaking change');
        expect(grammar.decimalScaleRule).toContain('version bump');
        expect(grammar.decimalScaleRule).toContain('renamed');
        expect(grammar.decimalScaleRule).toContain('AtMillis');
    });

    it('the grammar declares the decimal type a generator emits and its refusal to round', () =>
    {
        // The other promoted rule. A binary float would reintroduce exactly the
        // representation the removal of `number` took out, and rounding would move
        // the decision about a value's worth into the client.
        const grammar = bundle.typeGrammar as Record<string, string>;

        expect(grammar.decimalGeneratorRule).toContain('Swift Decimal');
        expect(grammar.decimalGeneratorRule).toContain('Kotlin BigDecimal');
        expect(grammar.decimalGeneratorRule).toContain('never a binary float');
        expect(grammar.decimalGeneratorRule).toContain('rejected at encoding time and never rounded');
    });

    it('an unknown spelling stays a contract error rather than something to guess at', () =>
    {
        // The fence an old consumer meets: `decimal<2>` reaching a generator that
        // predates the spelling is read as a type name and fails at compile time,
        // which is the outcome this rule asks for.
        const grammar = bundle.typeGrammar as Record<string, string>;

        expect(grammar.rule).toContain('contract error');
        expect(grammar.rule).toContain('fails at compile');
        expect(resolvable('decimal<0>')).toBe(false);
        expect(resolvable(`decimal<${MAX_DECIMAL_SCALE + 1}>`)).toBe(false);
        expect(resolvable('decimal<2>')).toBe(true);
        expect(resolvable('number')).toBe(false);
    });

    it('the grammar names both container spellings and no others', () =>
    {
        const grammar = bundle.typeGrammar as Record<string, string>;

        expect(grammar.array).toContain('array<T>');
        expect(grammar.map).toContain('map<string,T>');
        expect(grammar.map).toContain('only map spelling');
    });

    it('the grammar states the millisecond date convention instead of a date scalar', () =>
    {
        const grammar = bundle.typeGrammar as Record<string, string>;

        expect(SCALARS).not.toContain('date');
        expect(grammar.dateConvention).toContain('AtMillis');
        expect(grammar.dateConvention).toContain('milliseconds since the Unix epoch');
    });

    it('every field naming a moment in time is an integer ending in AtMillis', () =>
    {
        // Both halves of the convention. A `string` holding an ISO timestamp is the
        // second representation the grammar refuses, so the type is asserted too —
        // checking only the name would let one through. KeySummary's four date
        // fields were exactly that until 0.5.0.
        for (const type of declaredTypes)
        {
            for (const field of type.fields)
            {
                const path = `${type.name}.${field.name}`;

                if (!/(^|[a-z])(At|Time)([A-Z]|$)/.test(field.name))
                {
                    continue;
                }

                expect(field.type, path).toBe('integer');
                expect(field.name, path).toMatch(/Millis$/);
            }
        }
    });

    it('no string field holds a date', () =>
    {
        // The rule above passes vacuously if a date field is renamed out of the
        // pattern. This catches the other direction: a string that reads like a
        // moment, whatever it is called.
        for (const type of declaredTypes)
        {
            for (const field of type.fields)
            {
                if (field.type !== 'string')
                {
                    continue;
                }

                expect(field.name, `${type.name}.${field.name}`).not.toMatch(/(^|[a-z])(At|Time|Date)([A-Z]|$)/);
            }
        }
    });

    it('the bundle states that the date convention has no exceptions', () =>
    {
        const grammar = bundle.typeGrammar as Record<string, string>;

        expect(grammar.dateConventionExceptions).toContain('none');
    });

    it('KeyAlgorithm carries the values the server actually accepts', async () =>
    {
        // Read from the server's own list rather than transcribed, so an
        // algorithm added or withdrawn there moves the declaration with it.
        const { KEY_ALGORITHM } = await import('../../types');
        const declared = declaredEnums.find((entry) => entry.name === 'KeyAlgorithm');

        expect(declared?.values).toEqual([...KEY_ALGORITHM]);
    });

    it('every algorithm field references the enum rather than string', () =>
    {
        const algorithmFields = declaredTypes
            .flatMap((type) => type.fields.map((field) => ({ type: type.name, field })))
            .filter((entry) => entry.field.name === 'algorithm');

        expect(algorithmFields.length).toBeGreaterThan(0);

        for (const entry of algorithmFields)
        {
            expect(entry.field.type, `${entry.type}.algorithm`).toBe('KeyAlgorithm');
        }
    });

    it('the grammar does not tell a consumer what to do with a value outside a set', () =>
    {
        // A contract states what the server sends. How a decoder survives a set
        // that grew is the consumer's decision, and a set is not promised closed:
        // an algorithm can be withdrawn for a weakness found after this was written.
        const grammar = bundle.typeGrammar as Record<string, string>;

        expect(grammar.enumRule).not.toMatch(/decode failure/i);
        expect(grammar.enumRule).toContain('the consumer\'s decision');
        expect(grammar.enumRule).toContain('no set is promised to stay as it is');
    });

    it('every declared enum states values that are non-empty and unique', () =>
    {
        for (const declared of declaredEnums)
        {
            expect(declared.values.length, `${declared.name} has no values`).toBeGreaterThan(0);
            expect(new Set(declared.values).size, `${declared.name} repeats a value`).toBe(declared.values.length);

            for (const value of declared.values)
            {
                expect(typeof value, `${declared.name} value ${String(value)}`).toBe('string');
            }
        }
    });

    it('no enum name collides with a type name', () =>
    {
        for (const declared of declaredEnums)
        {
            expect(declaredNames, `enum ${declared.name}`).not.toContain(declared.name);
        }
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

    const declared = bundle.errors as { code: string; httpStatus: number; surface: string }[];

    // 두 표면은 어휘가 다르다. 프로필 안의 거절은 여섯 코드로 닫혀 있고, REST 표면은 서버
    // 에러 클래스 이름을 그대로 쓴다. 한 목록에 같이 실리므로 surface로 갈라 검사한다.
    const proofErrors = declared.filter((error) => error.surface === 'clientProofV1');

    it('the bundle declares every code the server can answer with, and no other', () =>
    {
        expect(proofErrors.map((error) => error.code).sort()).toEqual(Object.keys(REFUSALS).sort());
    });

    it('every declared status is the status that code actually answers with', () =>
    {
        for (const error of proofErrors)
        {
            expect(REFUSALS[error.code as ClientProofErrorCode]().httpStatus, error.code).toBe(error.httpStatus);
        }
    });

    it('the REST surface carries its own vocabulary, never the six refusal codes', () =>
    {
        const restCodes = declared.filter((error) => error.surface === 'rest').map((error) => error.code);

        expect(restCodes.length).toBeGreaterThan(0);
        expect(restCodes.filter((code) => code in REFUSALS)).toEqual([]);
    });

    it('every declared error names the surface it can appear on', () =>
    {
        expect(declared.filter((error) => !['clientProofV1', 'rest'].includes(error.surface))).toEqual([]);
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

    it('the proof header block does not absorb the identity headers', async () =>
    {
        // headerOrder is what a consumer builds a proven request from, and every
        // header named there is required. The identity headers are optional for
        // a caller that is not a deployed client, so they live in their own block.
        const { CLIENT_IDENTITY_HEADERS } = await import('../wire-headers');

        for (const name of Object.values(CLIENT_IDENTITY_HEADERS))
        {
            expect(Object.values(wire.headers)).not.toContain(name);
        }
    });
});

describe('the version each end announces', () =>
{
    const wire = bundle.wireMapping as Record<string, any>;

    it('the client identity headers are the ones the reader reads', async () =>
    {
        const { CLIENT_IDENTITY_HEADERS, CLIENT_KINDS } = await import('../wire-headers');

        expect(wire.clientIdentity.headers).toEqual({ ...CLIENT_IDENTITY_HEADERS });
        expect(wire.clientIdentity.kinds).toEqual([...CLIENT_KINDS]);
    });

    it('the server announcement headers are the ones the server writes', async () =>
    {
        const { SERVER_CONTRACT_HEADERS, serverContractHeaders } = await import('../wire-version');

        expect(wire.serverAnnouncement.headers).toEqual({ ...SERVER_CONTRACT_HEADERS });
        expect(Object.keys(serverContractHeaders()).sort())
            .toEqual(Object.values(SERVER_CONTRACT_HEADERS).sort());
    });

    it('states that the identity headers stay out of the proof input', async () =>
    {
        const { PROOF_INPUT_FIELDS } = await import('../proof');
        const { CLIENT_IDENTITY_HEADERS } = await import('../wire-headers');

        expect(wire.clientIdentity.proofRule).toContain('PROOF_INPUT_FIELDS');

        for (const name of Object.values(CLIENT_IDENTITY_HEADERS))
        {
            expect([...PROOF_INPUT_FIELDS]).not.toContain(name);
        }
    });

    it('states that the check reaches unproven operations too', () =>
    {
        // Enrollment and login carry no proof, and they are where a stale client
        // is met first. A rule that applied only to proven calls would never see it.
        expect(wire.clientIdentity.appliesTo).toContain('proven or not');
    });

    it('leaves the update decision to the client', () =>
    {
        expect(wire.serverAnnouncement.rule).toContain('the client\'s judgment');
        expect(JSON.stringify(wire.serverAnnouncement)).not.toMatch(/must update/i);
    });
});

describe('the compatibility policy is stated rather than inferred', () =>
{
    const policy = bundle.compatibilityPolicy as Record<string, string>;

    it('this contract is all-or-nothing', () =>
    {
        expect(policy.policy).toBe('allOrNothing');
    });

    it('names the other policy an app contract uses, so the two cannot be confused', () =>
    {
        expect(policy.contrast).toContain('perOperation');
    });
});

describe('declared proof rules match the implementation', () =>
{
    const profile = bundle.clientProofV1 as {
        proofInput: { fields: string[]; separator: string };
        signature: Record<string, string>;
        replayWindowMillis: number;
    };

    it('the contract line is the revision that takes client policy out of the error envelope', () =>
    {
        expect(bundle.contractVersion).toBe('0.8.0');
    });

    it('the supported range moves with the removed envelope declarations', () =>
    {
        // 0.8.0은 errorEnvelope에서 unknownCodePolicy와 unknownCodeRule을 없앤다.
        // 선언이 사라지면 소비자의 생성 코드가 달라지므로 breaking이고, 0.x에서
        // minor가 breaking을 나르므로 범위도 같이 올라간다 — 0.7.x 소비자가 남아
        // 있으면 안 된다.
        expect(bundle.supportedRange).toBe('>=0.8.0 <0.9.0');
    });

    it('states the rule that binds a native id_token to the key it enrolls', () =>
    {
        const enrollment = bundle.nativeEnrollment as Record<string, string>;

        expect(enrollment.appliesTo).toBe('auth.oauth.native');
        expect(enrollment.nonceRule).toContain('fingerprint');
        expect(enrollment.appleVariant).toContain('sha256hex(fingerprint)');
    });

    it('the signature section states the algorithm, wire encoding and key representation; mac is gone', async () =>
    {
        const { PROOF_SIGNATURE_BYTES, PROOF_SIGNATURE_HEX_LENGTH } = await import('../proof');
        expect(profile.signature.algorithm).toBe('ECDSA P-256 with SHA-256');
        expect(profile.signature.encoding).toContain(`${PROOF_SIGNATURE_BYTES} bytes`);
        expect(profile.signature.encoding).toContain(`${PROOF_SIGNATURE_HEX_LENGTH} hex characters`);
        expect(profile.signature.publicKey).toContain('SPKI DER, base64');
        expect(profile.signature.derRule).toContain('rejected');
        expect(bundle.clientProofV1).not.toHaveProperty('mac');
    });

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
