/**
 * Template loader utility
 *
 * Loads and processes template files with variable substitution
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Find templates directory
 * Works in both dev (src) and prod (dist) environments
 */
function findTemplatesPath(): string
{
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // Try relative path (for bundled dist)
    const distPath = join(__dirname, 'commands', 'generate', 'templates');
    if (existsSync(distPath))
    {
        return distPath;
    }

    // Try templates in same directory (for chunked builds)
    const sameDirPath = join(__dirname, 'templates');
    if (existsSync(sameDirPath))
    {
        return sameDirPath;
    }

    // Fallback to src path (for development)
    const srcPath = join(__dirname, '..', '..', 'src', 'commands', 'generate', 'templates');
    if (existsSync(srcPath))
    {
        return srcPath;
    }

    throw new Error(`Templates directory not found. Tried: ${distPath}, ${sameDirPath}, ${srcPath}`);
}

/**
 * Load template file and replace variables
 */
export function loadTemplate(
    templateName: string,
    variables: Record<string, string>
): string
{
    // Load template file
    const templatesDir = findTemplatesPath();
    const templatePath = join(templatesDir, `${templateName}.template`);
    let content = readFileSync(templatePath, 'utf-8');

    // Replace all variables
    for (const [key, value] of Object.entries(variables))
    {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        content = content.replace(regex, value);
    }

    return content;
}