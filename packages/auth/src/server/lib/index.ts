/**
 * @spfn/auth/lib
 *
 * Universal Node.js library for authentication
 * 범용 Node.js 라이브러리 (모든 Node.js 환경에서 사용 가능)
 *
 * - Key generation (ES256/RS256)
 * - JWT signing and verification
 * - Session encryption (Jose JWE)
 * - Session TTL configuration
 *
 * Use Cases:
 * - Next.js API Routes
 * - Express servers
 * - Fastify servers
 * - Any Node.js environment
 */

export * from './crypto';
export * from './session';
export * from './config';
export * from './oauth';
export * from './one-time-token';
export * from './deletion-config';
