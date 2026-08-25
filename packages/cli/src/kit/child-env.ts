/**
 * The only way a registry session reaches the package manager (unit 06
 * section 2.2 and 7.2).
 *
 * A private-registry install needs a bearer token, and there are four places
 * that token must never end up: a command argument, a file on disk, the
 * operation journal, and anything printed. That leaves one channel — the child
 * process's own environment — and this builds it.
 *
 * The environment is built up rather than inherited wholesale. A child that
 * inherits the parent's entire environment also inherits every other secret in
 * it, and the package manager has no business reading a database URL.
 */

/** Env names a package-manager child legitimately needs from the parent. */
export const PASSTHROUGH_ENV = [
    'PATH',
    'HOME',
    'USERPROFILE',
    'APPDATA',
    'LOCALAPPDATA',
    'SHELL',
    'LANG',
    'LC_ALL',
    'TMPDIR',
    'TEMP',
    'TMP',
    'SystemRoot',
    'COMSPEC',
    'NODE_OPTIONS',
    'CI',
] as const;

/** The env name the registry session is handed to the child under. */
export const REGISTRY_TOKEN_ENV = 'SPFN_REGISTRY_TOKEN';

/**
 * The CLI's own configuration, for a child that *is* this CLI.
 *
 * A `kit-check` gate runs `spfn kit check` in the project, and that child has
 * to reach the same control plane, trust the same keys and open the same
 * keychain namespace as the command that started it. With the package-manager
 * environment it does not: it falls back to the built-in defaults, finds no
 * credential in the default keychain namespace, and reports the project
 * unhealthy — so every gate run in a configured environment fails for a reason
 * that has nothing to do with the project.
 *
 * Every name here is configuration and none is a secret: two public origins, a
 * public allowlist, a set of public keys, a keychain namespace *name* and a
 * path to a certificate. The registry session is still the only secret that
 * crosses this boundary, and it still has its own parameter.
 */
export const KIT_CONFIG_ENV = [
    'SPFN_KIT_CONTROL_PLANE_URL',
    'SPFN_KIT_REGISTRY_URL',
    'SPFN_KIT_SETUP_ALLOWLIST',
    'SPFN_KIT_TRUSTED_KEYS',
    'SPFN_KIT_KEYCHAIN_NAMESPACE',
    'NODE_EXTRA_CA_CERTS',
] as const;

export interface ChildEnvOptions
{
    /** The parent environment to select from. */
    parent?: NodeJS.ProcessEnv;
    /** The short-lived registry session, if this child needs one. */
    registryToken?: string;
    /**
     * Where that session is good for. Public address, never a secret.
     *
     * Given alongside a session, the child is also handed the session as npm
     * configuration addressed to this registry — see `registryAuthEnv`.
     */
    registryUrl?: string;
    /** Extra secret-free variables, e.g. `npm_config_registry`. */
    extra?: Record<string, string>;
    /** Additional parent names to pass through. */
    passthrough?: readonly string[];
}

/**
 * Build the environment for a child process.
 *
 * Note what is *not* here: no way to add the token to `extra` by accident (it
 * has its own parameter and its own name), and no wildcard passthrough.
 */
export function createChildEnv(options: ChildEnvOptions = {}): Record<string, string>
{
    const parent = options.parent ?? process.env;
    const env: Record<string, string> = {};
    const names = [...PASSTHROUGH_ENV, ...(options.passthrough ?? [])];

    for (const name of names)
    {
        const value = parent[name];

        if (typeof value === 'string')
        {
            env[name] = value;
        }
    }
    for (const [name, value] of Object.entries(options.extra ?? {}))
    {
        env[name] = value;
    }
    if (options.registryToken !== undefined)
    {
        env[REGISTRY_TOKEN_ENV] = options.registryToken;

        if (options.registryUrl !== undefined)
        {
            Object.assign(env, registryAuthEnv(options.registryUrl, options.registryToken));
        }
    }

    return env;
}

/**
 * The registry URI a credential is filed under: the address with its scheme
 * removed and a trailing slash guaranteed.
 *
 * The trailing slash is the whole point. npm and pnpm match a stored
 * credential against the registry URI as written, and `//host/npm` does not
 * open `//host/npm/` — the token is simply never sent, and the install fails as
 * unauthorized with the credential sitting right there.
 */
function nerfDart(registryUrl: string): string
{
    return registryUrl.replace(/^https?:/, '').replace(/\/*$/, '/');
}

/**
 * The other spellings of the same address a package manager might look under.
 *
 * Two of them, and each earns its place:
 *
 *   - the *normalised* URI, because a package manager files a credential under
 *     the address it parsed rather than the address it was given. `//host:80/`
 *     and `//host/` are one address to a URL parser and two different strings
 *     to a lookup table, and the credential written the second way is never
 *     found;
 *   - the *port-less* URI, because pnpm 9 and 10 cannot receive a ported one.
 *     Each turns
 *     an environment variable into a setting by splitting its name at the
 *     *first* colon, so `//host:4873/npm/:_authToken` arrives as the setting
 *     `//host:4873/npm/:-authtoken` and opens nothing. A port-less key has one
 *     colon, survives that split, and pnpm retries a ported request against the
 *     port-less URI when nothing matched. Only pnpm 11 reads the exact key, and
 *     prefers it; the extra one costs it nothing.
 *
 * Parsed rather than pattern-matched, so an IPv6 literal (`//[::1]:4873/npm/`)
 * loses its port and not its address.
 */
function alternateNerfDarts(registryUrl: string): string[]
{
    try
    {
        const url = new URL(registryUrl);
        const normalized = nerfDart(url.toString());

        url.port = '';

        return [normalized, nerfDart(url.toString())];
    }
    catch
    {
        // Not an absolute URL. Inventing another key from a string nobody can
        // parse would only be guessing.
        return [];
    }
}

/**
 * The npm configuration keys a credential for this registry is filed under.
 *
 * The registry's own URI first, and the spellings a package manager might look
 * under instead — see `alternateNerfDarts` for why each exists. One key for the
 * ordinary case of a registry addressed by host and path alone.
 */
export function registryAuthKeys(registryUrl: string): string[]
{
    const exact = nerfDart(registryUrl);
    const uris = [...new Set([exact, ...alternateNerfDarts(registryUrl)])];

    return uris.map(uri => `${uri}:_authToken`);
}

/**
 * The registry session, spelled as npm configuration in the environment.
 *
 * This is the only channel that works across every pnpm a user may have. The
 * `.npmrc` this CLI writes used to carry `_authToken=${SPFN_REGISTRY_TOKEN}`,
 * and pnpm 10 and later refuse to expand a variable in a credential that came
 * from a *project* `.npmrc` — the file is committed, so a hostile edit could
 * point the secret at someone else's registry. pnpm warns and drops the line,
 * and the install then fails as unauthorized. Measured on 10.34.5 and 11.23.0;
 * 9.15.9 still expands it.
 *
 * npm and pnpm both accept configuration from `npm_config_*` variables, and a
 * per-registry credential can be spelled that way. The environment is not a
 * committed file, so the versions that refuse the `.npmrc` credential honour it,
 * and pnpm has read configuration this way for its whole life.
 *
 * The spelling is exact on purpose: the suffix is matched case-sensitively by
 * every version, so an all-lowercase `_authtoken` is silently not a credential
 * on any of them.
 */
export function registryAuthEnv(registryUrl: string, token: string): Record<string, string>
{
    const env: Record<string, string> = {};

    for (const key of registryAuthKeys(registryUrl))
    {
        env[`npm_config_${key}`] = token;
    }

    return env;
}

/**
 * An `.npmrc` that resolves the release's scopes to the private registry.
 *
 * There is no credential here, and there must never be one again: pnpm 10 and
 * later ignore a credential that comes from a project `.npmrc`, whether it names
 * a variable or spells the secret out. The session travels in the child's
 * environment instead (`registryAuthEnv`), which is also the only place this
 * CLI has ever allowed a secret to be.
 *
 * Every scope the release publishes under gets a line. A release whose packages
 * span two scopes and whose `.npmrc` names one leaves the other resolving
 * wherever the machine's own configuration happens to point, which is both a
 * broken install and a request sent somewhere nobody chose.
 */
export function registryNpmrc(scopes: string | readonly string[], registryUrl: string): string
{
    const names = typeof scopes === 'string' ? [scopes] : [...new Set(scopes)];

    return [
        ...names.map(scope => `${scope}:registry=${registryUrl}`),
        'always-auth=true',
        '',
    ].join('\n');
}
