/**
 * Fixed P-256 test keypairs for the client-proof suites.
 *
 * TEST ONLY — NOT SECRETS. Both keypairs were generated once with
 * `generateKeyPairSync('ec', { namedCurve: 'P-256' })` and frozen here so the
 * suites can sign deterministically-verifiable proofs. They were never issued
 * by anything, authenticate nothing, and must never be presented to a real
 * endpoint; publishing the private halves is intentional.
 */

export const TEST_CLIENT_ID = 'client-test-0001';

export const TEST_KEY_ID = 'key-test-0001';

/** SPKI DER base64 — the contract's public-key representation. */
export const TEST_PUBLIC_KEY_SPKI_B64 =
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAES7xktjK+fMydT7UZcfuW/vzU9rU/'
    + '+RPVVQKKgxrB1sd9bh6N1bqiBwU/zuw9/LaQ91lWPeWSN9OlT8OlDYXIYg==';

/** PKCS#8 DER base64. TEST ONLY — deliberately published, not a secret. */
export const TEST_PRIVATE_KEY_PKCS8_B64 =
    'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgMv3D4UvmGKjFeG3m'
    + 'yLLfwlcOAQ9n8qoFmwrgGWBErsShRANCAARLvGS2Mr58zJ1PtRlx+5b+/NT2tT/5'
    + 'E9VVAoqDGsHWx31uHo3VuqIHBT/O7D38tpD3WVY95ZI306VPw6UNhchi';

/** A second keypair for wrong-key and registration cases. */
export const OTHER_KEY_ID = 'key-test-0002';

export const OTHER_PUBLIC_KEY_SPKI_B64 =
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEEvA1Qe3c98K4+u/Gb5ORnGhqRGUU'
    + 'J6oCVYoxRdp5b0OiRS75v5ULruknszTl9+zd8yQ817hOPjWzdJiijXSQzw==';

/** PKCS#8 DER base64. TEST ONLY — deliberately published, not a secret. */
export const OTHER_PRIVATE_KEY_PKCS8_B64 =
    'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgcBSWaGkYFpu+WAjD'
    + 'NOwFXF1ubNfelYWjFmMRn97+69OhRANCAAQS8DVB7dz3wrj678Zvk5GcaGpEZRQn'
    + 'qgJVijFF2nlvQ6JFLvm/lQuu6SezNOX37N3zJDzXuE4+NbN0mKKNdJDP';

/** The registration every suite starts from: the primary keypair's public half. */
export const TEST_PUBLIC_KEYS = { [TEST_KEY_ID]: TEST_PUBLIC_KEY_SPKI_B64 };
