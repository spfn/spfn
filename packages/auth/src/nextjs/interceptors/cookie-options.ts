/**
 * Shared cookie option helpers for auth interceptors
 *
 * SPFN_AUTH_COOKIE_SECURE env var allows overriding the Secure flag.
 * - unset: defaults to NODE_ENV === 'production'
 * - "true" / "false": explicit override
 *
 * Useful for HTTP-only staging environments (e.g. bastion over plain HTTP).
 */

/**
 * Resolve whether cookies should have the Secure flag.
 *
 * Priority:
 * 1. SPFN_AUTH_COOKIE_SECURE (explicit override)
 * 2. NODE_ENV === 'production'
 */
function resolveSecure(): boolean
{
    const override = process.env.SPFN_AUTH_COOKIE_SECURE;

    if (override !== undefined)
    {
        return override === 'true';
    }

    return process.env.NODE_ENV === 'production';
}

/**
 * Whether cookies should have the Secure flag.
 * Evaluated once at module load time.
 */
export const cookieSecure = resolveSecure();
