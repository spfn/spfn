/**
 * One place turns a clientProofV1 refusal into a response.
 *
 * A proven call is answered by a generated SDK that classifies a failure by
 * `error.code` alone and refuses a code it does not know. So a refusal must
 * leave this server as the contract's own envelope — the canonical bytes of
 * `{"error":{"code","message","requestId"}}` carrying one of the six refusal
 * codes — and nothing else. Routing a refusal through the generic error
 * handler instead puts the wrapper error class's name in `error.code`
 * (`UnauthorizedError`), which no SDK can classify (#106).
 *
 * Every refusal surface (the guard, the profile middleware) builds its answer
 * here rather than assembling one of its own, so a code path added later
 * cannot reintroduce a body that says something else.
 *
 * hono is imported as types only, so this module adds no runtime dependency.
 *
 * @module server/client-proof/refusal-response
 */
import type { Context } from 'hono';

import { newHexId, type ClientProofRefusal } from './refusal';
import { serverContractHeaders } from './wire-version';

/**
 * The canonical contract envelope for one refusal, with the server's contract
 * announcement — a refused client needs the range most.
 */
export function clientProofRefusalResponse(c: Context, refusal: ClientProofRefusal): Response
{
    const bytes = refusal.envelopeBytes(newHexId());
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

    return c.newResponse(buffer, refusal.httpStatus as 401, {
        'content-type': 'application/json',
        ...serverContractHeaders(),
    });
}
