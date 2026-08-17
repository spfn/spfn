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
 */
export function registryNpmrc(scope: string, registryUrl: string): string
{
    const host = registryUrl.replace(/^https?:/, '').replace(/\/$/, '');

    return [
        `${scope}:registry=${registryUrl}`,
        `${host}:_authToken=\${${REGISTRY_TOKEN_ENV}}`,
        'always-auth=true',
        '',
    ].join('\n');
}
