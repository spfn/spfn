/**
 * The key-lifetime policy — one constant, read by the service that stamps
 * `expiresAt` on registration/rotation and by the mobile contract export
 * that advertises the TTL to clients. Deliberately dependency-free so the
 * contract exporter can import it without pulling repositories or the DB.
 *
 * @module server/lib/key-policy
 */

/** A registered public key expires this many days after registration. */
export const KEY_TTL_DAYS = 90;
