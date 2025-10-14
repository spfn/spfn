/**
 * SPFN Configuration Types
 */

/**
 * Package manager options
 */
export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';

/**
 * Custom domain configuration
 */
export interface CustomDomains {
    /**
     * Custom domains for Next.js frontend
     * These domains will route to port 3790
     *
     * Example: ['www.example.com', 'example.com']
     */
    nextjs: string[];

    /**
     * Custom domains for SPFN backend API
     * These domains will route to port 8790
     *
     * Example: ['api.example.com']
     */
    spfn: string[];
}

/**
 * Environment variable configuration
 */
export interface EnvironmentVariables {
    /**
     * Environment variables to inject into the container
     * These will be available to both Next.js and SPFN backend
     *
     * ⚠️  WARNING: Values are stored in Git. For sensitive data, use secrets management.
     *
     * Example:
     * env: {
     *   NEXT_PUBLIC_API_URL: 'https://api-dncbio.spfn.app',
     *   DATABASE_URL: 'postgresql://user:pass@host:5432/db',  // ⚠️  Not recommended
     *   REDIS_URL: 'redis://redis:6379'
     * }
     */
    [key: string]: string;
}

/**
 * Deployment configuration
 */
export interface DeploymentConfig {
    /**
     * Your app's subdomain on spfn.app
     *
     * This will automatically create two domains:
     * - {subdomain}.spfn.app → Next.js frontend (port 3790)
     * - api-{subdomain}.spfn.app → SPFN backend (port 8790)
     *
     * Example: subdomain: 'dncbio' creates:
     * - dncbio.spfn.app
     * - api-dncbio.spfn.app
     */
    subdomain: string;

    /**
     * Custom domains (optional)
     *
     * Add your own custom domains here. Make sure to configure DNS:
     * - CNAME record pointing to spfn.app
     */
    customDomains?: CustomDomains;

    /**
     * Environment variables (optional)
     *
     * Define environment variables to inject into both Next.js and SPFN backend.
     *
     * ⚠️  SECURITY WARNING:
     * - These values are stored in Git (spfn.config.js is committed)
     * - Do NOT put sensitive credentials here (DB passwords, API keys, etc.)
     * - For production secrets, use your CI/CD secrets management
     *
     * Good use cases:
     * - Public API URLs (NEXT_PUBLIC_*)
     * - Non-sensitive configuration
     * - Development/staging endpoints
     */
    env?: EnvironmentVariables;
}

/**
 * SPFN Configuration
 *
 * This interface defines the structure of spfn.config.js
 */
export interface SpfnConfig {
    /**
     * Package manager to use for dependency installation
     * Options: 'npm' | 'yarn' | 'pnpm' | 'bun'
     */
    packageManager: PackageManager;

    /**
     * Deployment configuration for SPFN cloud platform
     */
    deployment: DeploymentConfig;
}