/**
 * Contract Document Types
 *
 * The shape of `contracts/current.json` and of a released snapshot under
 * `contracts/released/<version>.json`.
 *
 * An operation is identified by its **name** — the key it holds in the router —
 * not by method and path. That is what lets a changed path be reported as a
 * broken promise instead of read as one operation disappearing and another
 * appearing.
 */

import type { RouteAuthProfile } from '../route/contract';
import type { HttpMethod } from '../route/types';

/** A JSON Schema object as TypeBox serializes it. */
export type JsonSchema = Record<string, unknown>;

/** Request schemas, one per part of the request. */
export interface ContractRequest
{
    params?: JsonSchema;
    query?: JsonSchema;
    body?: JsonSchema;
    formData?: JsonSchema;
    headers?: JsonSchema;
    cookies?: JsonSchema;
}

/** One contracted operation. */
export interface ContractOperation
{
    /** Router key. The operation's identity across versions. */
    name: string;

    method: HttpMethod;
    path: string;

    /** Contract version the operation first appeared in. */
    since: string;

    auth: RouteAuthProfile;
    requiresSession: boolean;

    /** Present only when the operation is announced for removal. */
    deprecatedIn?: string;

    /** What the client sends. */
    request: ContractRequest;

    /**
     * What middleware injects into the request before the handler sees it.
     *
     * A web client never sends these — an interceptor fills them in. A client
     * that talks to the route directly does send them, so they are part of the
     * published request shape and are compared under the request rules.
     */
    interceptor: ContractRequest;

    /** What the client reads. */
    response: JsonSchema;
}

/** The generated contract. */
export interface ContractDocument
{
    /** Shape version of this document, not of the API it describes. */
    documentVersion: 1;

    /** Sorted by name, so the file does not churn on router reordering. */
    operations: ContractOperation[];
}

/** A released snapshot: the document plus the digest that pins it. */
export interface ContractSnapshot
{
    version: string;

    /** SHA-256 over the canonical encoding of `document`. */
    sha256: string;

    document: ContractDocument;
}

/** What a gate violation is about. */
export type ContractViolationKind =
    | 'operation.removed'
    | 'operation.path-changed'
    | 'operation.method-changed'
    | 'request.required-field-added'
    | 'request.field-became-required'
    | 'request.type-changed'
    | 'response.field-removed'
    | 'response.field-became-optional'
    | 'response.type-changed'
    | 'usage.undecidable'
    | 'usage.still-called'
    | 'snapshot.digest-mismatch';

/** One reason the build refuses. */
export interface ContractViolation
{
    kind: ContractViolationKind;

    /** Operation name, when the violation belongs to one. */
    operation?: string;

    /** Where inside the operation, e.g. `request.body.email`. */
    location?: string;

    /** What went wrong, in one line. */
    detail: string;
}
