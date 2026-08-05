/**
 * Contract Collection
 *
 * Walks a loaded router and turns every route carrying `.contract()` into a
 * contract operation.
 *
 * The router is loaded and walked rather than parsed from source. Real routes
 * build their schemas from imported values — `EmailSchema`, `FileSchema()`,
 * `KEY_DEVICE_NAME_MAX_LENGTH` — which a source parser cannot resolve. Loading
 * costs a module import and no infrastructure: route modules have no
 * import-time side effects, so nothing here opens a database connection.
 */

import type { RouteDef } from '../route/route-builder';
import type { RouteInput } from '../route/route-input';
import type { Router } from '../route/router';
import type { ContractDocument, ContractOperation, ContractRequest, JsonSchema } from './types';

/** Thrown when the router cannot produce a contract at all. */
export class ContractCollectionError extends Error
{
    constructor(message: string)
    {
        super(message);
        this.name = 'ContractCollectionError';
    }
}

function isRouter(value: unknown): value is Router<any>
{
    return value !== null
        && typeof value === 'object'
        && 'routes' in value
        && '_routes' in value;
}

function isRouteDef(value: unknown): value is RouteDef<any>
{
    return value !== null
        && typeof value === 'object'
        && 'handler' in value;
}

/**
 * Strip TypeBox's symbol-keyed metadata and hand back plain JSON.
 *
 * The symbols carry no information the wire shape depends on, and they cannot
 * survive the round trip to a committed file.
 */
function toJsonSchema(schema: unknown): JsonSchema
{
    return JSON.parse(JSON.stringify(schema)) as JsonSchema;
}

const REQUEST_SECTIONS = ['params', 'query', 'body', 'formData', 'headers', 'cookies'] as const;

function toContractRequest(input: RouteInput | undefined): ContractRequest
{
    const request: ContractRequest = {};

    if (!input)
    {
        return request;
    }

    for (const section of REQUEST_SECTIONS)
    {
        const schema = input[section];
        if (schema)
        {
            request[section] = toJsonSchema(schema);
        }
    }

    return request;
}

interface Found
{
    operation: ContractOperation;

    /** Where the route was found, for a collision message. */
    trail: string;
}

function visitRouter(router: Router<any>, trail: string[], found: Map<string, Found>): void
{
    for (const [name, entry] of Object.entries(router.routes))
    {
        if (isRouter(entry))
        {
            visitRouter(entry, [...trail, name], found);
            continue;
        }

        if (!isRouteDef(entry))
        {
            continue;
        }

        const routeDef = entry as RouteDef<any>;
        if (!routeDef.contract)
        {
            continue;
        }

        addOperation(name, routeDef, [...trail, name], found);
    }

    for (const packageRouter of router._packageRouters ?? [])
    {
        visitRouter(packageRouter, [...trail, '(package)'], found);
    }
}

function addOperation(name: string, routeDef: RouteDef<any>, trail: string[], found: Map<string, Found>): void
{
    const where = trail.join('.');
    const contract = routeDef.contract!;

    if (!routeDef.method || !routeDef.path)
    {
        throw new ContractCollectionError(
            `Contracted route "${where}" has no method or path. `
            + 'A contract describes an operation on the wire, so both are required.',
        );
    }

    if (!contract.since)
    {
        throw new ContractCollectionError(
            `Contracted route "${where}" has no "since" version. `
            + 'The version an operation first appeared in is part of the promise.',
        );
    }

    if (!contract.response)
    {
        throw new ContractCollectionError(
            `Contracted route "${where}" declares no response schema. `
            + 'An operation with no body declares Type.Null().',
        );
    }

    const existing = found.get(name);
    if (existing)
    {
        throw new ContractCollectionError(
            `Two contracted routes are both named "${name}" (${existing.trail} and ${where}). `
            + 'An operation is identified by its name across versions, so names must be unique.',
        );
    }

    found.set(name, {
        trail: where,
        operation: {
            name,
            method: routeDef.method,
            path: routeDef.path,
            since: contract.since,
            auth: contract.auth ?? 'none',
            requiresSession: contract.requiresSession ?? false,
            ...(contract.deprecatedIn ? { deprecatedIn: contract.deprecatedIn } : {}),
            request: toContractRequest(routeDef.input),
            interceptor: toContractRequest(routeDef.interceptor),
            response: toJsonSchema(contract.response),
        },
    });
}

/**
 * Build the contract document from a loaded router.
 *
 * Routes without `.contract()` are skipped — they are not part of the promise.
 */
export function collectContractDocument(router: Router<any>): ContractDocument
{
    const found = new Map<string, Found>();
    visitRouter(router, ['router'], found);

    const operations = [...found.values()]
        .map(entry => entry.operation)
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    return { documentVersion: 1, operations };
}
