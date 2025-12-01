/**
 * Result of label synchronization
 */
export interface SyncResult
{
    added: string[];
    removed: string[];
    updated: string[];
    unchanged: string[];
}

/**
 * Options for label synchronization
 */
export interface SyncOptions
{
    /**
     * If true, removes labels from DB that don't exist in code
     * @default false
     */
    removeOrphaned?: boolean;

    /**
     * If true, runs in dry-run mode without actual DB changes
     * @default false
     */
    dryRun?: boolean;
}