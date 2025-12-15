import { config } from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";

/**
 * Load environment files for SPFN server
 *
 * Priority (high → low, later files don't override):
 * 1. .env.server.local  - Server-only secrets (gitignored)
 * 2. .env.server        - Server-only defaults
 * 3. .env.{NODE_ENV}.local
 * 4. .env.local         - Local overrides (gitignored)
 * 5. .env.{NODE_ENV}
 * 6. .env               - Defaults
 */
export function loadEnvFiles()
{
    const cwd = process.cwd();
    const nodeEnv = process.env.NODE_ENV || 'development';

    // Build list of .env files to load (in priority order, high → low)
    // dotenv won't override existing vars, so load high-priority files first
    const envFiles: string[] = [
        '.env.server.local',
        '.env.server',
        `.env.${nodeEnv}.local`,
        nodeEnv !== 'test' ? '.env.local' : null,
        `.env.${nodeEnv}`,
        '.env',
    ].filter((file): file is string => file !== null);

    // Load each file if it exists
    for (const file of envFiles)
    {
        const filePath = resolve(cwd, file);
        if (existsSync(filePath))
        {
            config({ path: filePath });
        }
    }
}