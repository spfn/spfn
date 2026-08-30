/**
 * `madge` ships no types, and the export isolation test needs exactly one of
 * its functions. This is that function, not the whole API.
 */
declare module 'madge'
{
    interface MadgeResult
    {
        obj(): Record<string, string[]>;
    }

    interface MadgeOptions
    {
        fileExtensions?: string[];
        includeNpm?: boolean;
        tsConfig?: string;
    }

    export default function madge(entry: string, options?: MadgeOptions): Promise<MadgeResult>;
}
