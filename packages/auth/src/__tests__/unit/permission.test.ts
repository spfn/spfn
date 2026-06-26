/**
 * @spfn/auth - Permission Service Tests
 *
 * Unit tests for the role-assignment authority guard (assertCanAssignRole).
 * Repositories are mocked so the privilege rule is tested in isolation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/server/repositories', () => ({
    usersRepository: { findById: vi.fn() },
    rolesRepository: { findById: vi.fn() },
    permissionsRepository: { findById: vi.fn() },
    rolePermissionsRepository: { findByRoleId: vi.fn() },
    userPermissionsRepository: { findValidByUserId: vi.fn() },
}));

import { assertCanAssignRole } from '@/server/services/permission.service';
import {
    usersRepository,
    rolesRepository,
    permissionsRepository,
    rolePermissionsRepository,
    userPermissionsRepository,
} from '@/server/repositories';

const SUPERADMIN_ROLE = 1;
const ADMIN_ROLE = 2;
const MEMBER_ROLE = 3;

const ROLES: Record<number, { id: number; name: string }> = {
    [SUPERADMIN_ROLE]: { id: SUPERADMIN_ROLE, name: 'superadmin' },
    [ADMIN_ROLE]: { id: ADMIN_ROLE, name: 'admin' },
    [MEMBER_ROLE]: { id: MEMBER_ROLE, name: 'member' },
};

const CALLER_ID = 10;

/** Set the role the caller currently holds. */
function setCallerRole(roleId: number): void
{
    vi.mocked(usersRepository.findById).mockResolvedValue({ id: CALLER_ID, roleId } as never);
}

/** Control whether the caller resolves the `admin:promote` permission. */
function setAdminPromote(granted: boolean): void
{
    vi.mocked(rolePermissionsRepository.findByRoleId).mockResolvedValue(
        (granted ? [{ permissionId: 99 }] : []) as never,
    );
    vi.mocked(permissionsRepository.findById).mockResolvedValue(
        { id: 99, name: 'admin:promote', isActive: true } as never,
    );
    vi.mocked(userPermissionsRepository.findValidByUserId).mockResolvedValue([] as never);
}

describe('assertCanAssignRole', () =>
{
    beforeEach(() =>
    {
        vi.clearAllMocks();
        vi.mocked(rolesRepository.findById).mockImplementation(
            (async (id: number) => ROLES[id] ?? null) as never,
        );
        setAdminPromote(false);
    });

    it('lets a superadmin assign any role, including superadmin', async () =>
    {
        setCallerRole(SUPERADMIN_ROLE);
        await expect(assertCanAssignRole(CALLER_ID, SUPERADMIN_ROLE)).resolves.toBeUndefined();
    });

    it('blocks a non-superadmin from assigning the superadmin role', async () =>
    {
        setCallerRole(ADMIN_ROLE);
        await expect(assertCanAssignRole(CALLER_ID, SUPERADMIN_ROLE))
            .rejects.toThrow('Only superadmin can assign superadmin role');
    });

    it('blocks assigning the admin role without admin:promote', async () =>
    {
        setCallerRole(ADMIN_ROLE);
        setAdminPromote(false);
        await expect(assertCanAssignRole(CALLER_ID, ADMIN_ROLE))
            .rejects.toThrow('admin:promote permission required');
    });

    it('allows assigning the admin role with admin:promote', async () =>
    {
        setCallerRole(ADMIN_ROLE);
        setAdminPromote(true);
        await expect(assertCanAssignRole(CALLER_ID, ADMIN_ROLE)).resolves.toBeUndefined();
    });

    it('allows a non-superadmin to assign an ordinary role', async () =>
    {
        setCallerRole(ADMIN_ROLE);
        await expect(assertCanAssignRole(CALLER_ID, MEMBER_ROLE)).resolves.toBeUndefined();
    });
});
