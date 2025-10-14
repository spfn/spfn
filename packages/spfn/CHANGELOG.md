# Changelog

All notable changes to the SPFN CLI will be documented in this file.

## [0.1.0-alpha.16] - 2025-01-14

### Added

- **Configuration Migration: spfn.json → spfn.config.js**
  - Migrated from JSON to JavaScript configuration for better developer experience
  - Added comprehensive JSDoc comments with inline documentation
  - TypeScript type definitions for IDE autocomplete support (`@type {import('spfn').SpfnConfig}`)
  - Supports ESM/CJS based on package.json settings

- **Environment Variables Support**
  - Added `env` section in `spfn.config.js` for injecting environment variables
  - Environment variables are shared between Next.js and SPFN backend
  - Includes security warnings about Git-committed values
  - CI/CD automatically extracts and injects env vars into Kubernetes deployment

- **Dual Domain Architecture**
  - Automatic domain generation: `{subdomain}.spfn.app` for Next.js
  - Automatic API domain: `api-{subdomain}.spfn.app` for SPFN backend
  - Custom domain support for both Next.js and SPFN API
  - Documented in JSDoc comments for easy reference

- **TypeScript Type Definitions**
  - `SpfnConfig` - Main configuration interface
  - `PackageManager` - Package manager options
  - `DeploymentConfig` - Deployment settings
  - `CustomDomains` - Custom domain configuration
  - `EnvironmentVariables` - Environment variable configuration

### Changed

- **spfn init** now generates `spfn.config.js` instead of `spfn.json`
- Removed `resources` section from user configuration (now platform-controlled for revenue model)
- Updated CI/CD pipeline to read JavaScript config files using Node.js ESM imports

### Example Configuration

```javascript
/**
 * @type {import('spfn').SpfnConfig}
 */
export default {
  packageManager: 'pnpm',
  deployment: {
    subdomain: 'myapp',
    customDomains: {
      nextjs: ['www.example.com'],
      spfn: ['api.example.com']
    },
    env: {
      NEXT_PUBLIC_API_URL: 'https://api-myapp.spfn.app',
      NODE_ENV: 'production'
    }
  }
}
```

## [0.1.0-alpha.15] - Previous Release

- Initial alpha release with basic SPFN functionality