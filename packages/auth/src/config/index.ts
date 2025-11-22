/**
 * Auth Package Configuration
 *
 * Centralized environment variable management for @spfn/auth.
 * Provides type-safe access to all environment variables with validation and defaults.
 *
 * @example
 * ```typescript
 * import { env } from '@spfn/auth/config';
 *
 * // Use global env object (lazy-loaded)
 * console.log(env.SPFN_AUTH_SESSION_SECRET);
 * console.log(env.SPFN_AUTH_BCRYPT_SALT_ROUNDS);
 * ```
 *
 * @module config
 */

import { getEnvVar, parseNumber } from '@spfn/core/env';
import { type AuthEnvKey, authEnvSchema } from './schema';
import type { AuthEnvConfig } from './types';
import { logger } from '@spfn/core/logger';

const configLogger = logger.child('@spfn/auth:config');

// ============================================================================
// Environment Variable Access
// ============================================================================

/**
 * Get Auth environment configuration based on schema
 *
 * Reads environment variables and applies defaults/validation from schema.
 * Handles backward compatibility with legacy environment variable names.
 *
 * @returns Type-safe Auth environment configuration object
 *
 * @example
 * ```typescript
 * const config = getEnvConfig();
 *
 * // Fully typed access
 * const secret: string = config.SPFN_AUTH_SESSION_SECRET;
 * const saltRounds: number = config.SPFN_AUTH_BCRYPT_SALT_ROUNDS;
 * ```
 */
export function getEnvConfig(): AuthEnvConfig
{
    const config: Record<string, any> = {};

    // Iterate through schema and get each environment variable
    for (const key of Object.keys(authEnvSchema) as AuthEnvKey[])
    {
        const schema = authEnvSchema[key];

        // Determine validator based on type if not explicitly provided
        let validator = schema.validator;

        if (!validator)
        {
            if (schema.type === 'number')
            {
                validator = parseNumber;
            }
        }

        // Get environment variable with schema's default and validator
        config[key] = getEnvVar(key, {
            default: schema.default,
            validator,
        });
    }

    // Handle backward compatibility with legacy fallbacks
    // These are handled directly in consuming code via process.env checks
    // to preserve the fallback chain (SPFN_AUTH_* → legacy → default)

    return config as AuthEnvConfig;
}

/**
 * Global Auth environment configuration singleton
 *
 * Lazy-loaded on first access. Use this for convenient access throughout your application.
 *
 * @example
 * ```typescript
 * import { env } from '@spfn/auth/config';
 *
 * // Access anywhere in your code
 * const secret = env.SPFN_AUTH_SESSION_SECRET;
 * const saltRounds = env.SPFN_AUTH_BCRYPT_SALT_ROUNDS;
 * ```
 */
let _envConfig: AuthEnvConfig | null = null;

export const env = new Proxy({} as AuthEnvConfig, {
    get(_target, prop: string)
    {
        if (!_envConfig)
        {
            _envConfig = getEnvConfig();
        }

        return _envConfig[prop as keyof AuthEnvConfig];
    },
});

/**
 * Reset the global environment configuration cache
 *
 * Useful for testing when you need to reload environment variables.
 *
 * @example
 * ```typescript
 * import { resetEnvConfig, env } from '@spfn/auth/config';
 *
 * // In tests
 * beforeEach(() => {
 *   process.env.SPFN_AUTH_SESSION_SECRET = 'test-secret-key-32-chars-long!!';
 *   resetEnvConfig(); // Force reload
 * });
 * ```
 */
export function resetEnvConfig(): void
{
    _envConfig = null;
}

/**
 * Validate Auth environment configuration
 *
 * Checks if all required environment variables are set.
 * Logs errors and warnings, then exits process if validation fails.
 *
 * @example
 * ```typescript
 * import { validateEnvConfig } from '@spfn/auth/config';
 *
 * // Call at application startup
 * validateEnvConfig();
 * ```
 */
export function validateEnvConfig(): void
{
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const key of Object.keys(authEnvSchema) as AuthEnvKey[])
    {
        const schema = authEnvSchema[key];

        // Only validate required variables
        if (!schema.required)
        {
            continue;
        }

        // Check both prefixed and legacy versions
        const value = process.env[key];

        // Special handling for SESSION_SECRET with fallback
        if (key === 'SPFN_AUTH_SESSION_SECRET')
        {
            const legacyValue = process.env.SESSION_SECRET;
            if (!value && !legacyValue)
            {
                errors.push(
                    `${key} (or SESSION_SECRET) is required but not set. ${schema.description}`
                );
                continue;
            }

            const actualValue = value || legacyValue;
            if (actualValue && actualValue.length < 32)
            {
                errors.push(
                    `${key} must be at least 32 characters long (current: ${actualValue.length} characters)`
                );
            }
            continue;
        }

        if (value === undefined || value === '')
        {
            errors.push(
                `${key} is required but not set. ${schema.description}`
            );
        }

        // Run validator if provided
        if (value && schema.validator)
        {
            try
            {
                schema.validator(value);
            }
            catch (error)
            {
                errors.push(
                    `${key} validation failed: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }
    }

    // Check for deprecated variables and warn
    const deprecatedVars = [
        'SESSION_SECRET',
        'JWT_SECRET',
        'JWT_EXPIRES_IN',
        'BCRYPT_SALT_ROUNDS',
        'VERIFICATION_TOKEN_SECRET',
        'ADMIN_ACCOUNTS',
        'ADMIN_EMAILS',
        'ADMIN_PASSWORDS',
        'ADMIN_ROLES',
        'ADMIN_EMAIL',
        'ADMIN_PASSWORD',
    ];

    for (const varName of deprecatedVars)
    {
        if (process.env[varName])
        {
            const newName = varName === 'SESSION_SECRET'
                ? 'SPFN_AUTH_SESSION_SECRET'
                : `SPFN_AUTH_${varName}`;

            warnings.push(
                `${varName} is deprecated. Use ${newName} instead.`
            );
        }
    }

    // Log errors
    if (errors.length > 0)
    {
        configLogger.error('\n❌ Auth Environment Validation Failed\n');
        configLogger.error('The following Auth environment variables are missing or invalid:\n');

        errors.forEach((error) =>
        {
            configLogger.error(`  • ${error}`);
        });

        configLogger.error('\nPlease check your .env files and ensure all required variables are set.');
        configLogger.error('See packages/auth/.env.example for reference.\n');

        if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test')
        {
            process.exit(1);
        }
    }

    // Log warnings
    if (warnings.length > 0)
    {
        configLogger.warn('\n⚠️  Auth Environment Warnings:\n');

        warnings.forEach((warning) =>
        {
            configLogger.warn(`  • ${warning}`);
        });

        configLogger.warn('');
    }
}

/**
 * Get environment variable schema by category
 *
 * @param category - Category name (e.g., 'session', 'jwt', 'security', 'admin')
 * @returns Array of schema entries for the category
 *
 * @example
 * ```typescript
 * import { getSchemaByCategory } from '@spfn/auth/config';
 *
 * const sessionVars = getSchemaByCategory('session');
 * console.log(sessionVars.map(v => v.key));
 * // ['SPFN_AUTH_SESSION_SECRET', 'SPFN_AUTH_SESSION_TTL']
 * ```
 */
export function getSchemaByCategory(category: string)
{
    return Object.entries(authEnvSchema)
        .filter(([_, schema]) => schema.category === category)
        .map(([key, schema]) => ({ ...schema, key }));
}

/**
 * Get all environment variable categories
 *
 * @returns Array of unique category names
 *
 * @example
 * ```typescript
 * import { getCategories } from '@spfn/auth/config';
 *
 * const categories = getCategories();
 * console.log(categories); // ['session', 'jwt', 'security', 'admin', 'api', 'legacy']
 * ```
 */
export function getCategories(): string[]
{
    const categories = new Set<string>();

    for (const key of Object.keys(authEnvSchema) as AuthEnvKey[])
    {
        const schema = authEnvSchema[key];
        if (schema.category)
        {
            categories.add(schema.category);
        }
    }

    return Array.from(categories).sort();
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get session secret with backward compatibility
 *
 * Priority:
 * 1. SPFN_AUTH_SESSION_SECRET (new prefixed version)
 * 2. SESSION_SECRET (legacy fallback)
 *
 * @returns Session secret string
 * @throws Error if no secret is set
 */
export function getSessionSecret(): string
{
    const secret = env.SPFN_AUTH_SESSION_SECRET;

    if (!secret)
    {
        throw new Error('SPFN_AUTH_SESSION_SECRET environment variable is not set');
    }

    if (secret.length < 32)
    {
        throw new Error('SPFN_AUTH_SESSION_SECRET must be at least 32 characters long');
    }

    return secret;
}

/**
 * Get JWT secret with backward compatibility
 *
 * Priority:
 * 1. SPFN_AUTH_JWT_SECRET (new prefixed version)
 * 2. JWT_SECRET (legacy fallback)
 * 3. Default development secret
 */
export function getJwtSecret(): string
{
    return env.SPFN_AUTH_JWT_SECRET || 'dev-secret-key-change-in-production';
}

/**
 * Get JWT expiration with backward compatibility
 *
 * Priority:
 * 1. SPFN_AUTH_JWT_EXPIRES_IN (new prefixed version)
 * 2. JWT_EXPIRES_IN (legacy fallback)
 * 3. Default '7d'
 */
export function getJwtExpiresIn(): string
{
    return env.SPFN_AUTH_JWT_EXPIRES_IN || '7d';
}

/**
 * Get bcrypt salt rounds with backward compatibility
 *
 * Priority:
 * 1. SPFN_AUTH_BCRYPT_SALT_ROUNDS (new prefixed version)
 * 2. BCRYPT_SALT_ROUNDS (legacy fallback)
 * 3. Default 10
 */
export function getBcryptSaltRounds(): number
{
    const value = env.SPFN_AUTH_BCRYPT_SALT_ROUNDS || 10;

    return typeof value === 'number' ? value : parseInt(value, 10);
}

/**
 * Get verification token secret with backward compatibility
 *
 * Priority:
 * 1. SPFN_AUTH_VERIFICATION_TOKEN_SECRET (new prefixed version)
 * 2. VERIFICATION_TOKEN_SECRET (legacy fallback)
 * 3. JWT secret as fallback
 */
export function getVerificationTokenSecret(): string
{
    return env.SPFN_AUTH_VERIFICATION_TOKEN_SECRET || getJwtSecret();
}

// ============================================================================
// Re-exports
// ============================================================================

// Re-export schema and types
export { authEnvSchema, authEnvKeys, type AuthEnvKey } from './schema';
export type { AuthEnvConfig } from './types';