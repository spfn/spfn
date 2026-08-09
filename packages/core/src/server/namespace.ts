/**
 * The paths `@spfn/core` registers for itself.
 *
 * Its own module because both `create-server.ts` (which registers them) and
 * `helpers.ts` (which reports them in the startup banner) need them, and
 * `create-server.ts` already imports `helpers.ts` — putting them in either file
 * would close a cycle, which `pnpm check:circular` fails the build on.
 *
 * @module server/namespace
 */

/**
 * The path prefix `@spfn/core` registers its own endpoints under.
 *
 * An app declaring a route in here is declaring something it does not own, and
 * the route will not run — core's endpoints are registered before app routes.
 * `@spfn/auth` (`/_auth/`) and ops routes (`/_ops/`) follow the same convention,
 * and neither has ever had a shadowing defect.
 */
export const CORE_NAMESPACE = '/_core';

/**
 * Where the built-in health endpoint always answers.
 *
 * Point a readiness probe, a Dockerfile `HEALTHCHECK` or an uptime monitor here
 * rather than at `/health`: no app route can claim this path, so the answer does
 * not depend on what the app happens to declare. A probe's path is fixed in
 * places this repository cannot change — a GitOps manifest, a Dockerfile, a load
 * balancer console — and a version bump migrates none of them.
 */
export const CORE_HEALTH_PATH = `${CORE_NAMESPACE}/health`;

/**
 * Where the built-in health endpoint used to answer.
 *
 * `@spfn/core` no longer registers it. The path is an app's to use like any
 * other, and a `GET` on it answers 410 with the new address for one release
 * whenever the app declares nothing there — a readiness probe failure shows an
 * operator neither a response body nor a status text, so a bare 404 would leave
 * them with nothing to search for.
 */
export const LEGACY_HEALTH_PATH = '/health';
