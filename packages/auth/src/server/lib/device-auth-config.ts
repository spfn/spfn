/**
 * Device-code Login Configuration
 *
 * Singleton config for device-code login, mirroring `lib/deletion-config.ts`: a
 * mutable module-level value, set once during `createAuthLifecycle()` and read at
 * request time.
 *
 * Both knobs are answers the server hands to a client that cannot ask again — the
 * waiting device is told its expiry and its poll interval in the `start` response
 * and then just obeys them — so they have to be resolved before any request is
 * served, not read from an environment variable at each use.
 */

export interface AuthDeviceAuthConfig
{
    /** How long a device code stays usable, in milliseconds. */
    ttlMs: number;

    /** How long the waiting device should wait between polls, in milliseconds. */
    intervalMs: number;
}

/**
 * Ten minutes. Long enough to walk to the other device and type the code, short
 * enough that a code glimpsed over a shoulder is worthless soon after.
 */
export const DEFAULT_DEVICE_AUTH_TTL_MS = 10 * 60 * 1000;

/** Five seconds. The interval the server asks for; the rate limit is what enforces it. */
export const DEFAULT_DEVICE_AUTH_INTERVAL_MS = 5 * 1000;

let config: AuthDeviceAuthConfig = {
    ttlMs: DEFAULT_DEVICE_AUTH_TTL_MS,
    intervalMs: DEFAULT_DEVICE_AUTH_INTERVAL_MS,
};

/**
 * Set the resolved device-auth config. Called synchronously from
 * `createAuthLifecycle()` for the same reason `configureDeletion` is: it must
 * take effect before any handler that reads `getDeviceAuthConfig()` can run.
 */
export function configureDeviceAuth(options?: Partial<AuthDeviceAuthConfig>): void
{
    config = {
        ttlMs: options?.ttlMs ?? DEFAULT_DEVICE_AUTH_TTL_MS,
        intervalMs: options?.intervalMs ?? DEFAULT_DEVICE_AUTH_INTERVAL_MS,
    };
}

/**
 * Read the current device-auth config. Safe to call any time — defaults apply
 * even if `createAuthLifecycle()` was never given a `deviceAuth` block.
 */
export function getDeviceAuthConfig(): AuthDeviceAuthConfig
{
    return config;
}
