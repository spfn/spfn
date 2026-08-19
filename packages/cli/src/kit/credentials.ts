/**
 * Where a Kit's local credential lives, and the two-step dance that puts it
 * there (unit 06 section 3.3).
 *
 * The credential is stored in the OS keychain under a service of its own,
 * `superfunction.spfn.kit`, so it is never reachable through the env-secret
 * path that `spfn secret` uses. What is committed to the repository is only
 * enough to *find* the item again — kit ID, activation ID, client ID — never
 * the value and never the expiry, which changes on every rotation and would
 * make the committed file wrong minutes after it was written.
 *
 * The dance matters. A first activation has no activation ID yet, so the CLI
 * generates the credential locally, writes it under a `pending` account, and
 * only then calls activation. If the response is lost in the network the same
 * pending value re-drives the same idempotent call, and a second slot is never
 * consumed. Once the server answers, the item moves to its final account. If
 * the license is refused, the pending item is deleted.
 */

import { randomBytes } from 'node:crypto';
import { detectStore, type SecretStore } from '../utils/secret-store/index.js';

/** The keychain service Kit credentials live under. Never the env-secret one. */
export const KIT_KEYCHAIN_SERVICE = 'superfunction.spfn.kit';

/** Names an isolated namespace *under* the Kit service. Never replaces it. */
export const KIT_KEYCHAIN_NAMESPACE_ENV = 'SPFN_KIT_KEYCHAIN_NAMESPACE';

const NAMESPACE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/**
 * Which keychain service this process reads Kit credentials from.
 *
 * Unit 10 §1.3 makes "an isolated Keychain namespace" a supported input: the
 * recovered-machine restore path has to start from a keychain that genuinely
 * holds nothing, and deleting the developer's real items to arrange that would
 * be destroying state to test a read.
 *
 * A namespace is appended, never substituted. The prefix stays
 * `superfunction.spfn.kit`, so the value cannot be pointed at the env-secret
 * service — which would put a Kit credential in the store `spfn secret` reads
 * — and the pattern keeps it inside the identifier syntax a keychain accepts.
 * An unusable value is refused rather than silently ignored, because silently
 * falling back to the real namespace is how a "new machine" test would end up
 * reading the old machine's credential and passing.
 */
export function kitKeychainService(env: NodeJS.ProcessEnv = process.env): string
{
    const namespace = env[KIT_KEYCHAIN_NAMESPACE_ENV];

    if (namespace === undefined || namespace === '')
    {
        return KIT_KEYCHAIN_SERVICE;
    }
    if (!NAMESPACE_PATTERN.test(namespace))
    {
        throw new Error(
            `${KIT_KEYCHAIN_NAMESPACE_ENV} must match ${String(NAMESPACE_PATTERN)}; refusing to guess a keychain service.`,
        );
    }

    return `${KIT_KEYCHAIN_SERVICE}.${namespace}`;
}

export interface KitCredentialRecord
{
    /** The opaque local credential the control plane issued or accepted. */
    credential: string;
    /** When registry access from this credential stops working. */
    accessExpiresAt: string;
    /** Server generation. A lower one than the server's is stale. */
    generation: number;
}

export interface KitCredentialIdentity
{
    kitId: string;
    localClientId: string;
    /** Present once the server has answered an activation. */
    activationId?: string;
    /** Present only while the first activation is still in flight. */
    installationId?: string;
}

/** `<kitId>:<activationId>:<localClientId>` — the settled item. */
export function finalAccount(kitId: string, activationId: string, localClientId: string): string
{
    return `${kitId}:${activationId}:${localClientId}`;
}

/** `<kitId>:pending:<installationId>:<localClientId>` — the in-flight item. */
export function pendingAccount(kitId: string, installationId: string, localClientId: string): string
{
    return `${kitId}:pending:${installationId}:${localClientId}`;
}

/** Identity of the item held while a first activation is in flight. */
export type PendingIdentity = Required<Pick<KitCredentialIdentity, 'kitId' | 'installationId' | 'localClientId'>>;

/** Identity of the settled item, once the server has answered. */
export type SettledIdentity = Required<Pick<KitCredentialIdentity, 'kitId' | 'activationId' | 'localClientId'>>;

export interface KitCredentialStore
{
    readonly id: string;
    isAvailable(): Promise<boolean>;
    readPending(identity: PendingIdentity): Promise<KitCredentialRecord | null>;
    savePending(identity: PendingIdentity, record: KitCredentialRecord): Promise<void>;
    /** Move the pending item to its final account. Returns what was moved. */
    promote(identity: Required<KitCredentialIdentity>, record?: KitCredentialRecord): Promise<KitCredentialRecord>;
    read(identity: SettledIdentity): Promise<KitCredentialRecord | null>;
    save(identity: SettledIdentity, record: KitCredentialRecord): Promise<void>;
    remove(account: string): Promise<void>;
}

/**
 * A client-generated credential proposal for the pending activation.
 *
 * The shape is the control plane's, not this CLI's: `spfnlc_` marks it a local
 * client credential, the 16 hex characters before the dot are the public id the
 * server files it under, and the rest is 32 bytes of randomness the server only
 * ever stores a hash of. Getting the shape wrong is not a cosmetic mistake —
 * the service rejects the activation outright.
 */
export function newCandidateCredential(): string
{
    return `spfnlc_${randomBytes(8).toString('hex')}.${randomBytes(32).toString('base64url')}`;
}

/**
 * The public id a credential carries, or null when it carries none.
 *
 * Used to address the credential in a control-plane path. The value before the
 * dot is public by construction; the part after it is the secret and is never
 * returned from here.
 */
export function credentialPublicId(credential: string): string | null
{
    const match = /^spfn[a-z]*_([0-9a-f]{16})\./.exec(credential);

    return match === null ? null : match[1];
}

/**
 * The real store: the platform keychain, under the Kit service.
 *
 * The record is stored as JSON so a rotation replaces value, expiry and
 * generation together — a credential whose generation is remembered separately
 * from its value is a credential that can be believed current after it is not.
 */
export class KeychainKitCredentialStore implements KitCredentialStore
{
    readonly id: string;

    private readonly store: SecretStore;

    constructor(store: SecretStore = detectStore(kitKeychainService()))
    {
        this.store = store;
        this.id = store.id;
    }

    isAvailable(): Promise<boolean>
    {
        return this.store.isAvailable();
    }

    async readPending(identity: PendingIdentity): Promise<KitCredentialRecord | null>
    {
        return this.readAccount(pendingAccount(identity.kitId, identity.installationId, identity.localClientId));
    }

    async savePending(identity: PendingIdentity, record: KitCredentialRecord): Promise<void>
    {
        await this.store.set(
            pendingAccount(identity.kitId, identity.installationId, identity.localClientId),
            JSON.stringify(record),
        );
    }

    async promote(identity: Required<KitCredentialIdentity>, record?: KitCredentialRecord): Promise<KitCredentialRecord>
    {
        const pending = pendingAccount(identity.kitId, identity.installationId, identity.localClientId);
        const value = record ?? await this.readAccount(pending);

        if (value === null)
        {
            throw new Error('There is no pending Kit credential to promote.');
        }

        // Written before deleted: a crash between the two leaves a duplicate,
        // which the next run cleans up. The other order loses the credential.
        await this.save(identity, value);
        await this.store.delete(pending);

        return value;
    }

    async read(identity: SettledIdentity): Promise<KitCredentialRecord | null>
    {
        return this.readAccount(finalAccount(identity.kitId, identity.activationId, identity.localClientId));
    }

    async save(identity: SettledIdentity, record: KitCredentialRecord): Promise<void>
    {
        await this.store.set(
            finalAccount(identity.kitId, identity.activationId, identity.localClientId),
            JSON.stringify(record),
        );
    }

    async remove(account: string): Promise<void>
    {
        await this.store.delete(account);
    }

    private async readAccount(account: string): Promise<KitCredentialRecord | null>
    {
        const raw = await this.store.get(account);

        if (raw === null)
        {
            return null;
        }

        try
        {
            const parsed = JSON.parse(raw);

            return typeof parsed?.credential === 'string' && typeof parsed?.generation === 'number'
                ? parsed as KitCredentialRecord
                : null;
        }
        catch
        {
            return null;
        }
    }
}

/**
 * An in-process store for tests and for the fake control plane.
 *
 * It exists so no test has to write to a developer's real keychain to prove
 * that a missing credential is reported as missing.
 */
export class MemoryKitCredentialStore implements KitCredentialStore
{
    readonly id = 'memory';

    readonly items = new Map<string, KitCredentialRecord>();

    async isAvailable(): Promise<boolean>
    {
        return true;
    }

    async readPending(identity: PendingIdentity): Promise<KitCredentialRecord | null>
    {
        return this.items.get(pendingAccount(identity.kitId, identity.installationId, identity.localClientId)) ?? null;
    }

    async savePending(identity: PendingIdentity, record: KitCredentialRecord): Promise<void>
    {
        this.items.set(pendingAccount(identity.kitId, identity.installationId, identity.localClientId), record);
    }

    async promote(identity: Required<KitCredentialIdentity>, record?: KitCredentialRecord): Promise<KitCredentialRecord>
    {
        const pending = pendingAccount(identity.kitId, identity.installationId, identity.localClientId);
        const value = record ?? this.items.get(pending) ?? null;

        if (value === null)
        {
            throw new Error('There is no pending Kit credential to promote.');
        }

        await this.save(identity, value);
        this.items.delete(pending);

        return value;
    }

    async read(identity: SettledIdentity): Promise<KitCredentialRecord | null>
    {
        return this.items.get(finalAccount(identity.kitId, identity.activationId, identity.localClientId)) ?? null;
    }

    async save(identity: SettledIdentity, record: KitCredentialRecord): Promise<void>
    {
        this.items.set(finalAccount(identity.kitId, identity.activationId, identity.localClientId), record);
    }

    async remove(account: string): Promise<void>
    {
        this.items.delete(account);
    }
}
