/**
 * @spfn/auth - Device code generation
 *
 * The two codes device-code login runs on, and the one-way function between the
 * device code and what is stored for it.
 *
 * They are different kinds of value and are treated differently everywhere. The
 * device code is a credential: the polling device holds it, nothing else proves
 * who that device is, so it is long, random, and stored only as a hash. The user
 * code is read off one screen and typed on another, so it is short and stored in
 * the clear — it authorizes nothing on its own, since only an already
 * authenticated caller can act on it.
 */

import { createHash, randomBytes, randomInt } from 'node:crypto';

/**
 * Alphabet the user code is drawn from.
 *
 * 0/O and 1/I/L are the pairs a person mistypes when copying a code between two
 * screens, so neither member of either pair is in the set. 31 characters over 8
 * positions is ~2^39 codes, which the per-IP and per-account rate limits on
 * every route that accepts one make unguessable in the ten minutes a code lives.
 */
export const USER_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Characters in a user code, not counting the dash it is displayed with. */
export const USER_CODE_LENGTH = 8;

/** Where the dash goes when the code is shown to a person: `XXXX-XXXX`. */
const USER_CODE_GROUP_SIZE = 4;

/** Entropy behind a device code. 256 bits, so it is never guessed. */
const DEVICE_CODE_BYTES = 32;

/**
 * A fresh user code in stored form — uppercase, no dash.
 *
 * `randomInt` rather than `Math.random`: this is drawn from the same CSPRNG the
 * device code is, and a predictable user code lets an attacker have a victim
 * approve a code the attacker is polling.
 */
export function generateUserCode(): string
{
    let code = '';

    for (let position = 0; position < USER_CODE_LENGTH; position++)
    {
        code += USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)];
    }

    return code;
}

/** The stored form as a person reads it: `XXXX-XXXX`. */
export function formatUserCode(userCode: string): string
{
    return `${userCode.slice(0, USER_CODE_GROUP_SIZE)}-${userCode.slice(USER_CODE_GROUP_SIZE)}`;
}

/**
 * Fold a typed user code back to the stored form.
 *
 * Someone reading `WXYZ-2345` off a screen types the dash, or spaces, or lower
 * case. All of those name the same code, so all of them have to reach the same
 * lookup — the alternative is a code that is on screen and still refused.
 *
 * Only the user code is normalized. The device code is a credential and is
 * matched byte for byte: accepting variant spellings of a credential is how one
 * token becomes several strings and a one-shot record is used twice.
 */
export function normalizeUserCode(input: string): string
{
    return input.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/** A fresh device code, returned to the new device once and never stored. */
export function generateDeviceCode(): string
{
    return randomBytes(DEVICE_CODE_BYTES).toString('base64url');
}

/**
 * What the row holds instead of the device code.
 *
 * Unsalted SHA-256, as with the ops-token and signup-link secrets: the input is
 * 256 bits of CSPRNG output, so there is no dictionary to defend against and a
 * per-row salt would only stop the exact-match lookup this has to support.
 */
export function hashDeviceCode(deviceCode: string): string
{
    return createHash('sha256').update(deviceCode).digest('hex');
}
