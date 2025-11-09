/**
 * @spfn/auth/adapters/nextjs
 *
 * Next.js Adapter for SPFN Auth
 * Next.js 전용 어댑터 (next/headers 사용)
 *
 * Provides:
 * - AuthClient with httpOnly cookie management
 * - Automatic key generation and storage
 * - Session management with Next.js cookies
 *
 * @requires next >= 13.0.0
 */

export * from './auth-client';