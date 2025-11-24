import { config } from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";

export function loadEnvFiles()
{
    const cwd = process.cwd();
    const nodeEnv = process.env.NODE_ENV || 'development';

    // Build list of .env files to load (in priority order)
    const envFiles: string[] = [
        `.env.${nodeEnv}.local`,
        nodeEnv !== 'test' ? '.env.local' : null,
        `.env.${nodeEnv}`,
        '.env',
    ].filter((file): file is string => file !== null);

    // Load each file if it exists
    // dotenv won't override existing vars, so loading high-priority files first works
    for (const file of envFiles)
    {
        const filePath = resolve(cwd, file);
        if (existsSync(filePath))
        {
            config({ path: filePath });
        }
    }
}