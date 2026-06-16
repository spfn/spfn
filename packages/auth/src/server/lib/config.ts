/**
 * @spfn/auth - Global Configuration
 *
 * Manages global auth configuration including session TTL
 */

import { env } from '@spfn/auth/config';

/**
 * Cookie name suffix derived from PORT to isolate sessions across
 * multiple local dev instances running on the same domain (localhost).
 */
function getCookieSuffix(): string
{
    const port = process.env.PORT;

    return port ? `_${port}` : '';
}

/**
 * Cookie names used by SPFN Auth
 *
 * Names include a port-based suffix so that multiple dev instances
 * on different ports don't overwrite each other's cookies.
 */
export const COOKIE_NAMES = {
    /** Encrypted session data (userId, privateKey, keyId, algorithm) */
    get SESSION() 
    {
        return `spfn_session${getCookieSuffix()}`; 
    },
    /** Current key ID (for key rotation) */
    get SESSION_KEY_ID() 
    {
        return `spfn_session_key_id${getCookieSuffix()}`; 
    },
    /** Pending OAuth session (privateKey, keyId, algorithm) - temporary during OAuth flow */
    get OAUTH_PENDING() 
    {
        return `spfn_oauth_pending${getCookieSuffix()}`; 
    },
};

/**
 * Parse duration string to seconds
 *
 * Supports: '30d', '12h', '45m', '3600s', or plain number
 *
 * @example
 * parseDuration('30d')   // 2592000 (30 days in seconds)
 * parseDuration('12h')   // 43200
 * parseDuration('45m')   // 2700
 * parseDuration('3600')  // 3600
 */
export function parseDuration(duration: string | number): number
{
    if (typeof duration === 'number')
    {
        return duration;
    }

    const match = duration.match(/^(\d+)([dhms]?)$/);
    if (!match)
    {
        throw new Error(`Invalid duration format: ${duration}. Use format like '30d', '12h', '45m', '3600s', or plain number.`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2] || 's';

    switch (unit)
    {
        case 'd':
            return value * 24 * 60 * 60;
        case 'h':
            return value * 60 * 60;
        case 'm':
            return value * 60;
        case 's':
            return value;
        default:
            throw new Error(`Unknown duration unit: ${unit}`);
    }
}

/**
 * Auth configuration
 */
export interface AuthConfig
{
    /**
     * Default session TTL in seconds or duration string
     *
     * Supports:
     * - Number: seconds (e.g., 2592000)
     * - String: '30d', '12h', '45m', '3600s'
     *
     * @default 7d (7 days)
     */
    sessionTtl?: string | number;
}

/**
 * Global auth configuration state
 */
let globalConfig: AuthConfig = {
    sessionTtl: '7d', // Default: 7 days
};

/**
 * Configure global auth settings
 *
 * @param config - Auth configuration
 *
 * @example
 * ```typescript
 * configureAuth({
 *   sessionTtl: '30d',  // 30 days
 * });
 * ```
 */
export function configureAuth(config: AuthConfig): void
{
    globalConfig = {
        ...globalConfig,
        ...config,
    };
}

/**
 * Get current auth configuration
 */
export function getAuthConfig(): AuthConfig
{
    return { ...globalConfig };
}

/**
 * Get session TTL in seconds
 *
 * Priority:
 * 1. Runtime override (remember parameter)
 * 2. Global config (configureAuth)
 * 3. Environment variable (SPFN_AUTH_SESSION_TTL) - via config module
 * 4. Default (7 days)
 */
export function getSessionTtl(override?: string | number): number
{
    // 1. Runtime override
    if (override !== undefined)
    {
        return parseDuration(override);
    }

    // 2. Global config
    if (globalConfig.sessionTtl !== undefined)
    {
        return parseDuration(globalConfig.sessionTtl);
    }

    // 3. Environment variable (from config module)
    const envTtl = env.SPFN_AUTH_SESSION_TTL;
    if (envTtl)
    {
        return parseDuration(envTtl);
    }

    // 4. Default: 7 days
    return 7 * 24 * 60 * 60;
}
