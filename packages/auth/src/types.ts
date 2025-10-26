/**
 * @spfn/auth - Type definitions
 */

// User types will be defined here
export type UserRole = 'admin' | 'user';

// Session types will be defined here
export interface SessionPayload {
  userId: string;
  role?: UserRole;
}

// RBAC types will be defined here
export interface Permission {
  resource: string;
  action: string;
}