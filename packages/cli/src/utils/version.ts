// Injected at build time by tsup
declare const __CLI_VERSION__: string;

/**
 * Get the CLI package version (injected at build time)
 */
export function getCliVersion(): string
{
    return __CLI_VERSION__;
}

/**
 * Extract npm tag from version string
 *
 * Examples:
 * - "0.2.0-beta.5" -> "beta"
 * - "0.2.0-alpha.1" -> "alpha"
 * - "0.2.0" -> "latest"
 */
export function getTagFromVersion(version: string): string
{
    const match = version.match(/-([a-z]+)\./i);

    return match ? match[1] : 'latest';
}

/**
 * Get the npm tag for SPFN dependencies based on CLI version
 */
export function getSpfnTag(): string
{
    return getTagFromVersion(getCliVersion());
}
