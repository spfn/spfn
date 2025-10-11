/**
 * Code Generation Types
 *
 * Types for contract detection and client code generation
 */

import type { HttpMethod } from '../route/types.js';

export type { HttpMethod };

/**
 * Route-Contract mapping extracted from contract files
 */
export interface RouteContractMapping
{
    /** HTTP method (GET, POST, etc.) */
    method: HttpMethod;

    /** URL path (e.g., /users/:id) */
    path: string;

    /** Contract variable name (e.g., getUserContract) */
    contractName: string;

    /** Import path for the contract (e.g., @/contracts/users) */
    contractImportPath: string;

    /** Route file path */
    routeFile: string;

    /** Contract source file path (resolved) */
    contractFile?: string;
}

/**
 * Grouped routes by resource
 */
export interface ResourceRoutes
{
    [resource: string]: RouteContractMapping[];
}

/**
 * Client generation options
 */
export interface ClientGenerationOptions
{
    /** Routes directory to scan */
    routesDir: string;

    /** Output file path for generated client */
    outputPath: string;

    /** Base URL for the API client */
    baseUrl?: string;

    /** Include type imports? */
    includeTypes?: boolean;

    /** Generate JSDoc comments? */
    includeJsDoc?: boolean;
}

/**
 * Generation statistics
 */
export interface GenerationStats
{
    /** Total routes scanned */
    routesScanned: number;

    /** Routes with contracts found */
    contractsFound: number;

    /** Unique contract files */
    contractFiles: number;

    /** Resources generated */
    resourcesGenerated: number;

    /** Total methods generated */
    methodsGenerated: number;

    /** Generation time in ms */
    duration: number;
}