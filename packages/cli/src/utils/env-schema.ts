/**
 * Shared access to a package's env schema (the `envSchema` export of its
 * `<pkg>/config` entrypoint), plus secret-oriented helpers.
 *
 * Extracted from `commands/env.ts` so `spfn env` and `spfn secret` read the schema
 * the same way.
 */

/** Valid NODE_ENV values accepted by `--env`. */
export const VALID_ENVS = ['local', 'development', 'staging', 'production', 'test'] as const;

export type EnvName = (typeof VALID_ENVS)[number];

/** Generation strategies declared by `envSecret({ generate })` in the schema. */
export type GenerateSpec = 'hex32' | 'hex64' | 'uuid' | 'base64url32';

/** A single env-var schema entry (the shape `@spfn/core/env` produces). */
export interface EnvSchemaEntry
{
    key: string;
    type: 'string' | 'number' | 'boolean' | 'url' | 'enum' | 'json';
    description: string;
    required?: boolean;
    default?: unknown;
    sensitive?: boolean;
    generate?: GenerateSpec;
    nextjs?: boolean;
    examples?: unknown[];
}

export type EnvSchema = Record<string, EnvSchemaEntry>;

/**
 * Load the `envSchema` export from a package's `/config` entrypoint.
 */
export async function loadEnvSchema(packageName: string): Promise<EnvSchema>
{
    try
    {
        const module = await import(`${packageName}/config`);

        if (!module.envSchema)
        {
            throw new Error(`Package ${packageName} does not export envSchema from config`);
        }

        return module.envSchema as EnvSchema;
    }
    catch (error)
    {
        if (error instanceof Error && error.message.includes('does not export envSchema'))
        {
            throw error;
        }

        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to load package ${packageName}: ${message}`);
    }
}

/**
 * Determine which env file a variable belongs in (Next.js-facing vs server-only).
 */
export function getTargetFile(schema: EnvSchemaEntry): string
{
    const isNextjs = schema.nextjs ?? schema.key?.startsWith('NEXT_PUBLIC_');

    if (isNextjs)
    {
        return schema.sensitive ? '.env.local' : '.env';
    }

    return '.env.server';
}

/** All secret (sensitive) entries of a schema. */
export function secretEntries(schema: EnvSchema): EnvSchemaEntry[]
{
    return Object.values(schema).filter((entry) => entry.sensitive);
}

/** Secret entries that declare a `generate` strategy (we can mint these). */
export function generatableSecrets(schema: EnvSchema): EnvSchemaEntry[]
{
    return secretEntries(schema).filter((entry) => !!entry.generate);
}
