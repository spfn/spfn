/**
 * Route Contract
 *
 * A contract marks a route as a versioned public promise to clients that are
 * compiled and deployed separately from the server — a mobile app, an external
 * API consumer. Those clients cannot be fixed by redeploying the server, so the
 * shape they read has to survive server changes.
 *
 * A web client does not need this. `createApi<AppRouter>()` derives its types
 * from the router in the same build, so a removed response field breaks the
 * TypeScript compile instead of a running app.
 *
 * The response shape is declared here rather than inferred from the handler's
 * return type: a declared schema exists at runtime, which is what the generator
 * and the compatibility gate read. `_response` on RouteDef disappears after
 * compilation.
 */

import type { TSchema } from '@sinclair/typebox';

/**
 * Authentication profile a contracted operation is admitted under.
 *
 * - `none` — the operation is called before any key exists to sign with
 *   (enrollment, login), so it carries neither proof nor session headers.
 * - `clientProofV1` — admitted by the @spfn/auth client-proof admission order.
 *
 * The union is deliberately closed. A profile name is part of what the contract
 * publishes to external clients, so adding one is a change to this file rather
 * than a string a route can invent.
 */
export type RouteAuthProfile = 'none' | 'clientProofV1';

/**
 * The public promise a contracted route makes.
 */
export interface RouteContract
{
    /** Contract version this operation first appeared in (e.g. '1.2.0'). */
    since: string;

    /**
     * Response shape. TypeBox schema, declared — not inferred.
     *
     * An operation that answers with no body declares `Type.Null()`.
     */
    response: TSchema;

    /** Authentication profile. Defaults to `'none'`. */
    auth?: RouteAuthProfile;

    /** Whether the call carries a session. Defaults to `false`. */
    requiresSession?: boolean;

    /** Contract version this operation was announced for removal in. */
    deprecatedIn?: string;

    /**
     * Contract version this operation was removed in.
     *
     * Set on a route kept alive only to carry the record. A client generated
     * before the removal still calls it, and this is what tells that client the
     * operation went and when — a route that simply disappears says nothing.
     */
    removedIn?: string;
}
