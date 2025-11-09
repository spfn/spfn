/**
 * RequireAuth Guard Component
 *
 * Requires user to be authenticated
 */

import { redirect } from 'next/navigation';
import { getSession } from '@/adapters/nextjs/server';
import type { ReactNode } from 'react';

export interface RequireAuthProps
{
    /**
     * Children to render if authenticated
     */
    children: ReactNode;

    /**
     * Path to redirect to if not authenticated
     * @default '/login'
     */
    redirectTo?: string;

    /**
     * Fallback UI to show instead of redirecting
     */
    fallback?: ReactNode;
}

/**
 * Require Authentication Guard
 *
 * Ensures user is logged in before rendering children
 *
 * @example
 * ```tsx
 * <RequireAuth redirectTo="/login">
 *   <DashboardContent />
 * </RequireAuth>
 * ```
 *
 * @example With fallback
 * ```tsx
 * <RequireAuth fallback={<LoginPrompt />}>
 *   <PrivateContent />
 * </RequireAuth>
 * ```
 */
export async function RequireAuth({
    children,
    redirectTo = '/login',
    fallback,
}: RequireAuthProps)
{
    const session = await getSession();

    if (!session)
    {
        if (fallback)
        {
            return <>{fallback}</>;
        }

        redirect(redirectTo);
    }

    return <>{children}</>;
}