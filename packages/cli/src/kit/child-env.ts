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
    }

    return env;
}

/**
 * An `.npmrc` that points at the private registry and reads the token from the
 * environment — the file references the secret, it never contains it.
 *
 * Every scope the release publishes under gets a line. A release whose packages
 * span two scopes and whose `.npmrc` names one leaves the other resolving
 * wherever the machine's own configuration happens to point, which is both a
 * broken install and a request sent somewhere nobody chose.
 *
 * The auth key keeps its trailing slash. npm and pnpm match a stored
 * credential against the registry URI as written, and `//host/npm` does not
 * match a registry of `//host/npm/` — the token is simply never sent, and the
 * install fails as unauthorized with the credential sitting right there.
 */
export function registryNpmrc(scopes: string | readonly string[], registryUrl: string): string
{
    const authKey = `${registryUrl.replace(/^https?:/, '').replace(/\/*$/, '/')}:_authToken`;
    const names = typeof scopes === 'string' ? [scopes] : [...new Set(scopes)];

    return [
        ...names.map(scope => `${scope}:registry=${registryUrl}`),
        `${authKey}=\${${REGISTRY_TOKEN_ENV}}`,
        'always-auth=true',
        '',
    ].join('\n');
}
