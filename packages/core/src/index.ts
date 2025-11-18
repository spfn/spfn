/**
 * @spfn/core - DO NOT IMPORT FROM THIS PATH
 *
 * ⚠️ This module has no exports.
 *
 * You must use specific submodules instead:
 *
 * ## Universal (Client + Server)
 * - @spfn/core/types       - Type definitions (RouteContract, InferContract, etc.)
 * - @spfn/core/client      - ContractClient
 * - @spfn/core/client/nextjs - NextjsClient
 * - @spfn/core/errors      - Error classes
 *
 * ## Server-Only
 * - @spfn/core/server      - Server creation and management
 * - @spfn/core/route       - Route binding utilities
 * - @spfn/core/db          - Database utilities (Drizzle)
 * - @spfn/core/cache       - Cache utilities (Valkey/Redis)
 * - @spfn/core/middleware  - Server middleware
 * - @spfn/core/logger      - Logging utilities
 * - @spfn/core/env         - Environment variable management
 * - @spfn/core/config      - Environment configuration schema
 * - @spfn/core/events      - Event system
 *
 * ## Build-Time
 * - @spfn/core/codegen     - Code generation utilities
 *
 * @example
 * ```typescript
 * // ❌ DON'T
 * import { createServer } from '@spfn/core';
 *
 * // ✅ DO
 * import { createServer } from '@spfn/core/server';
 * import type { RouteContract } from '@spfn/core/types';
 * import { createClient } from '@spfn/core/client';
 * import { env } from '@spfn/core/config';
 * ```
 */

// Intentionally empty - use submodules