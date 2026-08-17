/**
 * Validators for the three I0 contracts the CLI owns.
 *
 * The frozen schemas live in `test/landing-kit-contracts/schemas` as a
 * byte-identical copy of spfn-course's originals, and nothing in `src/` may
 * copy them again — a second copy is a second thing to drift. So the runtime
 * validators are written out here, and `test/kit/contract-agreement.test.ts`
 * drives them with the frozen fixtures: every positive fixture must pass, every
 * negative fixture must fail at the exact JSON pointer the fixture names.
 *
 * A validator here is a gate, not a parser: it says which pointer is wrong and
 * why, and it never repairs, coerces or defaults a value it was handed.
 */

export interface ValidationIssue
{
    /** RFC 6901 JSON pointer into the value, e.g. `/checkpoints/0/id`. */
    pointer: string;
    message: string;
}

export interface ValidationResult
{
    valid: boolean;
    issues: ValidationIssue[];
}

export const PATTERNS = {
    publicId: /^[a-z0-9][a-z0-9._-]{0,79}$/,
    instant: /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,3})?Z$/,
    digest: /^sha256:[0-9a-f]{64}$/,
    version: /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)*$/,
    commit: /^[0-9a-f]{40}$/,
    httpsUrl: /^https:\/\/[a-z0-9.-]+(:[0-9]+)?(\/[^\s?#]*)?$/,
    setupUrl: /^https:\/\/[a-z0-9.-]+\/setup\/[a-z0-9][a-z0-9._-]{0,79}$/,
    payloadKind: /^[a-z0-9][a-z0-9./-]{0,79}@[0-9]+$/,
    failureCode: /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/,
} as const;

/** Collects issues so a caller sees every problem, not only the first. */
class Validator
{
    readonly issues: ValidationIssue[] = [];

    fail(pointer: string, message: string): false
    {
        this.issues.push({ pointer, message });

        return false;
    }

    object(pointer: string, value: unknown, allowed: readonly string[], required: readonly string[]): boolean
    {
        if (typeof value !== 'object' || value === null || Array.isArray(value))
        {
            return this.fail(pointer, 'expected an object');
        }

        const record = value as Record<string, unknown>;

        for (const key of Object.keys(record))
        {
            if (!allowed.includes(key))
            {
                this.fail(`${pointer}/${key}`, 'is not a field of this contract');
            }
        }
        for (const key of required)
        {
            if (record[key] === undefined)
            {
                this.fail(`${pointer}/${key}`, 'is required');
            }
        }

        return true;
    }

    const(pointer: string, value: unknown, expected: unknown): boolean
    {
        return value === expected ? true : this.fail(pointer, `must be ${JSON.stringify(expected)}`);
    }

    enum(pointer: string, value: unknown, allowed: readonly unknown[]): boolean
    {
        if (allowed.includes(value))
        {
            return true;
        }

        return this.fail(pointer, `must be one of ${allowed.map(item => JSON.stringify(item)).join(', ')}`);
    }

    pattern(pointer: string, value: unknown, pattern: RegExp): boolean
    {
        if (typeof value !== 'string')
        {
            return this.fail(pointer, 'expected a string');
        }
        if (!pattern.test(value))
        {
            return this.fail(pointer, `does not match ${pattern.source}`);
        }

        return true;
    }

    text(pointer: string, value: unknown, min: number, max: number): boolean
    {
        if (typeof value !== 'string')
        {
            return this.fail(pointer, 'expected a string');
        }
        if (value.length < min || value.length > max)
        {
            return this.fail(pointer, `length must be between ${min} and ${max}`);
        }

        return true;
    }

    array(pointer: string, value: unknown, minItems: number): value is unknown[]
    {
        if (!Array.isArray(value))
        {
            return this.fail(pointer, 'expected an array') as false;
        }
        if (value.length < minItems)
        {
            return this.fail(pointer, `needs at least ${minItems} item(s)`) as false;
        }

        return true;
    }

    result(): ValidationResult
    {
        return { valid: this.issues.length === 0, issues: this.issues };
    }
}

const DESCRIPTOR_FIELDS = [
    'schemaVersion', 'descriptorId', 'productId', 'productKind', 'issuedAt', 'expiresAt',
    'setupUrl', 'displayName', 'supportUrl', 'cli', 'catalogUrl', 'manifestUrl',
    'payloadKind', 'payloadDigest', 'payload',
] as const;

/** `setup-descriptor-envelope.v1` — the generic half; the payload stays opaque. */
export function validateSetupDescriptorEnvelope(value: unknown): ValidationResult
{
    const validator = new Validator();

    if (!validator.object('', value, DESCRIPTOR_FIELDS, DESCRIPTOR_FIELDS))
    {
        return validator.result();
    }

    const record = value as Record<string, unknown>;

    validator.const('/schemaVersion', record.schemaVersion, 1);
    validator.pattern('/descriptorId', record.descriptorId, PATTERNS.publicId);
    validator.pattern('/productId', record.productId, PATTERNS.publicId);
    validator.enum('/productKind', record.productKind, ['kit']);
    validator.pattern('/issuedAt', record.issuedAt, PATTERNS.instant);
    validator.pattern('/expiresAt', record.expiresAt, PATTERNS.instant);
    validator.pattern('/setupUrl', record.setupUrl, PATTERNS.setupUrl);
    validator.text('/displayName', record.displayName, 1, 120);
    validator.pattern('/supportUrl', record.supportUrl, PATTERNS.httpsUrl);
    validator.pattern('/catalogUrl', record.catalogUrl, PATTERNS.httpsUrl);
    validator.pattern('/manifestUrl', record.manifestUrl, PATTERNS.httpsUrl);
    validator.pattern('/payloadKind', record.payloadKind, PATTERNS.payloadKind);
    validator.pattern('/payloadDigest', record.payloadDigest, PATTERNS.digest);

    const cliFields = ['package', 'recommendedVersion', 'minimumVersion'] as const;

    if (validator.object('/cli', record.cli, cliFields, cliFields))
    {
        const cli = record.cli as Record<string, unknown>;

        validator.const('/cli/package', cli.package, 'spfn');
        validator.pattern('/cli/recommendedVersion', cli.recommendedVersion, PATTERNS.version);
        validator.pattern('/cli/minimumVersion', cli.minimumVersion, PATTERNS.version);
    }

    // The payload is a product's own business. The envelope only asks that it
    // be an object, so the digest has something well-defined to cover.
    if (typeof record.payload !== 'object' || record.payload === null || Array.isArray(record.payload))
    {
        validator.fail('/payload', 'expected an object');
    }

    return validator.result();
}

export const KIT_CHECKPOINT_IDS = [
    'descriptor-verified',
    'catalog-verified',
    'activation-complete',
    'materialize-complete',
    'install-frozen',
    'routes-generated',
    'waiting-cloud',
    'plan-approved',
    'provider-provisioned',
    'migration-applied',
    'local-gates-passed',
    'deploy-bootstrapped',
    'staged-verified',
    'promoted',
    'browser-captured',
    'waiting-settlement',
    'ops-reported',
] as const;

export type KitCheckpointId = (typeof KIT_CHECKPOINT_IDS)[number];

export const KIT_OPERATION_STATUSES = [
    'active',
    'waiting-approval',
    'waiting-cloud',
    'waiting-settlement',
    'failed',
    'completed',
    'abandoned',
] as const;

export type KitOperationStatus = (typeof KIT_OPERATION_STATUSES)[number];

export const KIT_OPERATION_TYPES = ['install', 'restore', 'update', 'move', 'rollback'] as const;

export type KitOperationType = (typeof KIT_OPERATION_TYPES)[number];

const JOURNAL_FIELDS = [
    'schemaVersion', 'operationId', 'type', 'kitId', 'sourceRelease', 'targetRelease',
    'manifestDigest', 'planDigest', 'phase', 'status', 'checkpoints', 'externalRefs',
    'createdAt', 'updatedAt',
] as const;

const EXTERNAL_REF_FIELDS = [
    'activationId', 'backupId', 'sourceCommit', 'pushedCommit', 'deploymentId',
] as const;

const CHECKPOINT_FIELDS = ['id', 'status', 'evidenceDigest', 'completedAt', 'resumeAfter'] as const;

/** `kit-operation-journal.v1` — the resume identity, and never a secret. */
export function validateOperationJournal(value: unknown): ValidationResult
{
    const validator = new Validator();

    if (!validator.object('', value, JOURNAL_FIELDS, JOURNAL_FIELDS))
    {
        return validator.result();
    }

    const record = value as Record<string, unknown>;

    validator.const('/schemaVersion', record.schemaVersion, 1);
    validator.pattern('/operationId', record.operationId, PATTERNS.publicId);
    validator.enum('/type', record.type, KIT_OPERATION_TYPES);
    validator.pattern('/kitId', record.kitId, PATTERNS.publicId);

    if (record.sourceRelease !== null)
    {
        validator.pattern('/sourceRelease', record.sourceRelease, PATTERNS.version);
    }

    validator.pattern('/targetRelease', record.targetRelease, PATTERNS.version);
    validator.pattern('/manifestDigest', record.manifestDigest, PATTERNS.digest);
    validator.pattern('/planDigest', record.planDigest, PATTERNS.digest);
    validator.pattern('/phase', record.phase, PATTERNS.publicId);
    validator.enum('/status', record.status, KIT_OPERATION_STATUSES);
    validator.pattern('/createdAt', record.createdAt, PATTERNS.instant);
    validator.pattern('/updatedAt', record.updatedAt, PATTERNS.instant);

    if (validator.array('/checkpoints', record.checkpoints, 1))
    {
        record.checkpoints.forEach((checkpoint, index) =>
        {
            const pointer = `/checkpoints/${index}`;

            if (!validator.object(pointer, checkpoint, CHECKPOINT_FIELDS, ['id', 'status']))
            {
                return;
            }

            const entry = checkpoint as Record<string, unknown>;

            validator.enum(`${pointer}/id`, entry.id, KIT_CHECKPOINT_IDS);
            validator.enum(`${pointer}/status`, entry.status, ['pending', 'completed', 'failed']);

            if (entry.evidenceDigest !== undefined)
            {
                validator.pattern(`${pointer}/evidenceDigest`, entry.evidenceDigest, PATTERNS.digest);
            }
            if (entry.completedAt !== undefined)
            {
                validator.pattern(`${pointer}/completedAt`, entry.completedAt, PATTERNS.instant);
            }
            if (entry.resumeAfter !== undefined)
            {
                validator.pattern(`${pointer}/resumeAfter`, entry.resumeAfter, PATTERNS.instant);
            }
        });
    }

    if (validator.object('/externalRefs', record.externalRefs, EXTERNAL_REF_FIELDS, []))
    {
        const refs = record.externalRefs as Record<string, unknown>;

        for (const key of ['activationId', 'backupId', 'deploymentId'] as const)
        {
            if (refs[key] !== undefined)
            {
                validator.pattern(`/externalRefs/${key}`, refs[key], PATTERNS.publicId);
            }
        }
        for (const key of ['sourceCommit', 'pushedCommit'] as const)
        {
            if (refs[key] !== undefined)
            {
                validator.pattern(`/externalRefs/${key}`, refs[key], PATTERNS.commit);
            }
        }
    }

    return validator.result();
}

export const PROVIDER_IDS = ['github', 'vercel', 'supabase'] as const;

export type KitProviderId = (typeof PROVIDER_IDS)[number];

export const PROVIDER_ACTIONS = [
    'discover', 'authorize', 'create', 'bind', 'configure', 'deploy', 'promote', 'rollback',
] as const;

export const PROVIDER_STATUSES = [
    'planned', 'waiting-approval', 'approval-denied', 'approval-expired',
    'price-unresolved', 'target-drift', 'applied', 'failed',
] as const;

const PROVIDER_FIELDS = [
    'schemaVersion', 'operationId', 'activationId', 'provider', 'action', 'effect', 'target',
    'planDigest', 'approvalDigest', 'requestedScopes', 'status', 'startedAt', 'completedAt',
    'failureCode', 'evidence',
] as const;

const PROVIDER_REQUIRED = [
    'schemaVersion', 'operationId', 'activationId', 'provider', 'action', 'effect', 'target',
    'planDigest', 'approvalDigest', 'requestedScopes', 'status', 'startedAt',
] as const;

const TARGET_FIELDS = [
    'provider', 'accountId', 'accountLabel', 'resourceId', 'resourceLabel', 'environment', 'region',
] as const;

const EVIDENCE_TEXT_FIELDS = [
    'repositoryId', 'supabaseProjectRef', 'backupId', 'vercelProjectId',
    'stagedDeploymentId', 'currentDeploymentId',
] as const;

const EVIDENCE_FIELDS = [
    'planDigest', 'approvalDigest', 'sourceCommit', ...EVIDENCE_TEXT_FIELDS,
    'migrationDigest', 'deploymentGeneration', 'publicBaseUrl', 'healthEvidenceDigest',
] as const;

/** `provider-operation-envelope.v1` — identity, approval and outcome only. */
export function validateProviderOperationEnvelope(value: unknown): ValidationResult
{
    const validator = new Validator();

    if (!validator.object('', value, PROVIDER_FIELDS, PROVIDER_REQUIRED))
    {
        return validator.result();
    }

    const record = value as Record<string, unknown>;

    validator.const('/schemaVersion', record.schemaVersion, 1);
    validator.pattern('/operationId', record.operationId, PATTERNS.publicId);
    validator.pattern('/activationId', record.activationId, PATTERNS.publicId);
    validator.enum('/provider', record.provider, PROVIDER_IDS);
    validator.enum('/action', record.action, PROVIDER_ACTIONS);
    validator.enum('/effect', record.effect, ['read', 'external-write', 'destructive']);
    validator.pattern('/planDigest', record.planDigest, PATTERNS.digest);
    validator.enum('/status', record.status, PROVIDER_STATUSES);
    validator.pattern('/startedAt', record.startedAt, PATTERNS.instant);

    if (record.approvalDigest !== null)
    {
        validator.pattern('/approvalDigest', record.approvalDigest, PATTERNS.digest);
    }
    if (record.completedAt !== undefined)
    {
        validator.pattern('/completedAt', record.completedAt, PATTERNS.instant);
    }
    if (record.failureCode !== undefined)
    {
        validator.pattern('/failureCode', record.failureCode, PATTERNS.failureCode);
    }

    if (validator.array('/requestedScopes', record.requestedScopes, 0))
    {
        const scopes = record.requestedScopes as unknown[];

        scopes.forEach((scope, index) => validator.text(`/requestedScopes/${index}`, scope, 1, 120));

        if (new Set(scopes).size !== scopes.length)
        {
            validator.fail('/requestedScopes', 'must not repeat a scope');
        }
    }

    validateProviderTarget(validator, record.target);

    if (record.evidence !== undefined)
    {
        validateProviderEvidence(validator, record.evidence);
    }

    return validator.result();
}

function validateProviderTarget(validator: Validator, value: unknown): void
{
    const required = ['provider', 'accountId', 'resourceId', 'environment'] as const;

    if (!validator.object('/target', value, TARGET_FIELDS, required))
    {
        return;
    }

    const target = value as Record<string, unknown>;

    validator.enum('/target/provider', target.provider, PROVIDER_IDS);
    validator.text('/target/accountId', target.accountId, 1, 200);
    validator.text('/target/resourceId', target.resourceId, 1, 200);
    validator.const('/target/environment', target.environment, 'production');

    for (const key of ['accountLabel', 'resourceLabel'] as const)
    {
        if (target[key] !== undefined)
        {
            validator.text(`/target/${key}`, target[key], 1, 200);
        }
    }
    if (target.region !== undefined)
    {
        validator.text('/target/region', target.region, 1, 60);
    }
}

function validateProviderEvidence(validator: Validator, value: unknown): void
{
    const required = ['planDigest', 'approvalDigest', 'sourceCommit'] as const;

    if (!validator.object('/evidence', value, EVIDENCE_FIELDS, required))
    {
        return;
    }

    const evidence = value as Record<string, unknown>;

    validator.pattern('/evidence/planDigest', evidence.planDigest, PATTERNS.digest);
    validator.pattern('/evidence/approvalDigest', evidence.approvalDigest, PATTERNS.digest);
    validator.pattern('/evidence/sourceCommit', evidence.sourceCommit, PATTERNS.commit);

    for (const key of EVIDENCE_TEXT_FIELDS)
    {
        if (evidence[key] !== undefined)
        {
            validator.text(`/evidence/${key}`, evidence[key], 1, 200);
        }
    }
    for (const key of ['migrationDigest', 'healthEvidenceDigest'] as const)
    {
        if (evidence[key] !== undefined)
        {
            validator.pattern(`/evidence/${key}`, evidence[key], PATTERNS.digest);
        }
    }
    if (evidence.deploymentGeneration !== undefined
        && (!Number.isInteger(evidence.deploymentGeneration) || (evidence.deploymentGeneration as number) < 1))
    {
        validator.fail('/evidence/deploymentGeneration', 'must be an integer of at least 1');
    }
    if (evidence.publicBaseUrl !== undefined)
    {
        validator.pattern('/evidence/publicBaseUrl', evidence.publicBaseUrl, /^https:\/\/[a-z0-9.-]+(\/[^\s?#]*)?$/);
    }
}
