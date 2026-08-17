/**
 * Where a Kit project keeps its generated state (unit 06 section 5.1).
 *
 *   .spfn/license.json                   committed — public IDs and URLs only
 *   .spfn/kit-lock.json                  committed — the signed installed state
 *   .spfn/operations/active.json         ignored  — the running operation
 *   .spfn/operations/history/<id>.json   ignored  — bounded local history
 *   .spfn/operations/operation.lock/     ignored  — the process lock directory
 *
 * Two of these are committed and four are not, and the split is the point: what
 * a clean clone needs to restore an exact release is committed, and what is
 * true only of one machine's run is not.
 */

import { join } from 'node:path';

export const KIT_STATE_DIR = '.spfn';

export interface KitPaths
{
    /** The project root — the directory holding `.spfn`. */
    root: string;
    stateDir: string;
    licenseFile: string;
    lockFile: string;
    operationsDir: string;
    activeJournal: string;
    historyDir: string;
    lockDir: string;
    lockOwnerFile: string;
}

export function kitPaths(root: string): KitPaths
{
    const stateDir = join(root, KIT_STATE_DIR);
    const operationsDir = join(stateDir, 'operations');
    const lockDir = join(operationsDir, 'operation.lock');

    return {
        root,
        stateDir,
        licenseFile: join(stateDir, 'license.json'),
        lockFile: join(stateDir, 'kit-lock.json'),
        operationsDir,
        activeJournal: join(operationsDir, 'active.json'),
        historyDir: join(operationsDir, 'history'),
        lockDir,
        lockOwnerFile: join(lockDir, 'owner.json'),
    };
}
