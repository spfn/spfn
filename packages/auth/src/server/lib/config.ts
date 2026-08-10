/**
 * @spfn/auth - Global Configuration
 *
 * Manages global auth configuration including session TTL
 */

import { env } from '@spfn/auth/config';

import type { SocialProvider } from '../types';
import { normalizeOptionalEmail } from '../helpers/email';

/**
 * Cookie name suffix derived from the server port, so several local dev
 * instances on the same domain do not overwrite each other's sessions.
 *
 * BREAKING: this read `PORT`, which no longer exists — the framework's port is
 * `SPFN_PORT`, because `PORT` is Next.js's own variable and two processes are
 * started. An app that had `PORT` set gets different cookie names than before
 * and its existing sessions stop resolving; one sign-in fixes it.
 */
function getCookieSuffix(): string
{
    const port = process.env.SPFN_PORT;

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
    /** OAuth CSRF nonce — double-submit against the (encrypted) state.nonce at callback */
    get OAUTH_CSRF()
    {
        return `spfn_oauth_csrf${getCookieSuffix()}`;
    },
};

/**
 * OAuth CSRF 쿠키를 PORT 접미사와 무관하게 전부 수집한다.
 *
 * 쿠키를 심는 쪽은 Next.js 프로세스, 읽는 쪽은 API 프로세스라 분리 배포에서는
 * 두 프로세스의 PORT가 달라 COOKIE_NAMES.OAUTH_CSRF 정확 일치 조회가 빗나간다.
 * nonce 자체가 랜덤값이고 암호화된 state의 nonce와 대조되므로, 접미사가 다른
 * spfn_oauth_csrf* 후보를 모두 대조 대상으로 넘겨도 안전하다.
 */
export function matchOAuthCsrfCookies(
    cookies: Record<string, string>,
): { name: string; value: string }[]
{
    return Object.entries(cookies)
        .filter(([name]) => /^spfn_oauth_csrf(_\d+)?$/.test(name))
        .map(([name, value]) => ({ name, value }));
}

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
 * Registration channel passed to the beforeRegister hook
 *
 * - credentials: email/phone + password registration
 * - oauth: new-user signup through a social provider (web or native flow)
 * - invitation: invitation acceptance
 */
export type RegisterChannel = 'credentials' | 'oauth' | 'invitation';

/**
 * Context passed to the beforeRegister hook
 *
 * Credentials (password, keys) are intentionally excluded — the hook is a
 * policy gate, not a credential handler.
 */
export interface BeforeRegisterContext
{
    channel: RegisterChannel;
    /** Social provider — only set when channel is 'oauth' */
    provider?: SocialProvider;
    /**
     * Canonical form of the address — trimmed and lower-cased, the same form
     * the account is stored under. A policy keyed on the address (a denylist, a
     * domain allowlist) therefore matches whatever capitalization the person
     * typed, instead of being walked past by `Blocked@Example.com`.
     */
    email?: string;
    /**
     * Whether the email is verified — only set when channel is 'oauth'.
     * OAuth providers may report an unverified (spoofable) email; the created
     * account stores it as null in that case, so email-based policies must
     * check this flag. credentials/invitation emails are already verified.
     */
    emailVerified?: boolean;
    phone?: string;
    /** App-supplied registration metadata (register params / OAuth start params / invitation) */
    metadata?: Record<string, unknown>;
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

    /**
     * App-injected validator that runs before a new user row is created,
     * on every registration channel (credentials, oauth, invitation).
     *
     * Throw to reject the registration — RegistrationRejectedError (403) is
     * the recommended error; any HttpError subclass keeps its own status.
     * Runs after built-in checks (verification token, duplicate account),
     * so existing error precedence is unchanged. Not called for admin
     * seeding (initializeAuth) or when linking a social account to an
     * existing user.
     *
     * Runs inside the registration DB transaction on every channel — keep it
     * fast. A slow call (e.g. an external policy API) holds a pooled DB
     * connection open for its full duration on every signup.
     *
     * @example
     * ```typescript
     * configureAuth({
     *     beforeRegister: async ({ channel, metadata }) =>
     *     {
     *         if (channel === 'credentials' && !isOldEnough(metadata?.birthDate))
     *         {
     *             throw new RegistrationRejectedError({ message: 'Age requirement not met' });
     *         }
     *     },
     * });
     * ```
     */
    beforeRegister?: (context: BeforeRegisterContext) => void | Promise<void>;
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
 * Run the app-injected beforeRegister hook if configured — throws to reject.
 *
 * Single entry point for every registration channel so a new channel cannot
 * forget the configured-check. Callers invoke this right before creating the
 * user row.
 *
 * The address is folded here rather than at each call site, for the same reason
 * the check itself lives here: three channels supply it, and a policy that sees
 * a different spelling depending on which one the person came through is a
 * policy that can be walked past.
 */
export async function runBeforeRegister(context: BeforeRegisterContext): Promise<void>
{
    const { beforeRegister } = globalConfig;

    if (beforeRegister)
    {
        await beforeRegister({ ...context, email: normalizeOptionalEmail(context.email) });
    }
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
