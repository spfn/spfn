/**
 * Environment Variable Documentation Generator
 *
 * 스키마로부터 문서를 자동 생성합니다.
 *
 * @module env/docs-generator
 */

import type { EnvRegistry } from './registry';
import type { EnvVarSchema } from './schema';
import { isClientAccessible } from './schema';

/**
 * Markdown 문서 생성
 *
 * @param registry - 환경변수 레지스트리
 * @returns Markdown 형식의 문서
 *
 * @example
 * ```typescript
 * const env = createEnvRegistry(schema);
 * const markdown = generateMarkdownDocs(env);
 * writeFileSync('docs/ENVIRONMENT.md', markdown);
 * ```
 */
export function generateMarkdownDocs(registry: EnvRegistry): string
{
    const schemas = Array.from(registry.getAllSchemas().values());
    const byCategory = groupByCategory(schemas);

    let md = '# Environment Variables\n\n';
    md += '> Auto-generated from schema definitions\n\n';

    // 요약 통계
    md += '## Summary\n\n';
    md += `- **Total**: ${schemas.length} variables\n`;
    md += `- **Required**: ${registry.getRequired().length}\n`;
    md += `- **Sensitive**: ${registry.getSensitive().length}\n`;
    md += `- **Server Only**: ${registry.getServerOnly().length}\n`;
    md += `- **Client Accessible**: ${registry.getClientAccessible().length}\n\n`;

    // 카테고리별 문서
    for (const [category, categorySchemas] of Object.entries(byCategory))
    {
        md += `## ${category}\n\n`;

        for (const schema of categorySchemas)
        {
            md += generateSchemaMarkdown(schema);
        }
    }

    return md;
}

/**
 * 개별 스키마 Markdown 생성
 */
function generateSchemaMarkdown(schema: EnvVarSchema): string
{
    let md = `### \`${schema.key}\`\n\n`;

    // Runtime 표시
    const isClient = isClientAccessible(schema.key);
    const runtimeEmoji = isClient ? '🌐' : '🖥️';
    const runtimeText = isClient ? 'Client + Server' : 'Server only';
    md += `${runtimeEmoji} **Runtime**: ${runtimeText}\n\n`;

    // 설명
    md += `${schema.description}\n\n`;

    // 기본 정보
    md += `**Properties:**\n`;
    md += `- Type: \`${schema.type}\`\n`;
    md += `- Required: ${schema.required ? '✅ Yes' : '❌ No'}\n`;

    if (schema.default !== undefined)
    {
        md += `- Default: \`${schema.default}\`\n`;
    }

    if (schema.sensitive)
    {
        md += `- 🔒 Sensitive: Yes\n`;
    }

    // 예시
    if (schema.examples && schema.examples.length > 0)
    {
        md += `\n**Examples:**\n`;
        for (const example of schema.examples)
        {
            md += `\`\`\`\n${schema.key}=${example}\n\`\`\`\n`;
        }
    }

    md += '\n---\n\n';

    return md;
}

/**
 * .env.example 파일 생성
 *
 * @param registry - 환경변수 레지스트리
 * @returns .env.example 파일 내용
 *
 * @example
 * ```typescript
 * const env = createEnvRegistry(schema);
 * const example = generateEnvExample(env);
 * writeFileSync('.env.example', example);
 * ```
 */
export function generateEnvExample(registry: EnvRegistry): string
{
    const schemas = Array.from(registry.getAllSchemas().values());
    const byCategory = groupByCategory(schemas);

    let env = '# Environment Variables\n';
    env += '# Auto-generated from schema\n';
    env += '# Copy this to .env.local and fill in the values\n\n';

    for (const [category, categorySchemas] of Object.entries(byCategory))
    {
        env += `#\n# ${category}\n#\n\n`;

        for (const schema of categorySchemas)
        {
            // 설명
            env += `# ${schema.description}\n`;

            // 예시
            if (schema.examples && schema.examples.length > 0)
            {
                env += `# Example: ${schema.examples[0]}\n`;
            }

            // 타입 정보
            const typeInfo = `${schema.type}${schema.required ? ' (required)' : ''}`;
            env += `# Type: ${typeInfo}\n`;

            // 민감정보 표시
            if (schema.sensitive)
            {
                env += `# 🔒 Sensitive information\n`;
            }

            // 값
            const value = schema.default !== undefined ? schema.default : '';
            const prefix = schema.required ? '' : '# ';
            env += `${prefix}${schema.key}=${value}\n\n`;
        }
    }

    return env;
}

/**
 * JSON 문서 생성 (API용)
 *
 * @param registry - 환경변수 레지스트리
 * @returns JSON 형식의 문서
 *
 * @example
 * ```typescript
 * const env = createEnvRegistry(schema);
 * const json = generateJsonDocs(env);
 * writeFileSync('docs/environment.json', json);
 * ```
 */
export function generateJsonDocs(registry: EnvRegistry): string
{
    const schemas = Array.from(registry.getAllSchemas().values());

    const doc = {
        metadata: {
            generatedAt: new Date().toISOString(),
            totalCount: schemas.length,
            requiredCount: registry.getRequired().length,
            sensitiveCount: registry.getSensitive().length,
            serverOnlyCount: registry.getServerOnly().length,
            clientAccessibleCount: registry.getClientAccessible().length,
        },
        variables: schemas.map((schema) => ({
            key: schema.key,
            description: schema.description,
            type: schema.type,
            required: schema.required || false,
            default: schema.default,
            category: schema.category,
            sensitive: schema.sensitive || false,
            isClientAccessible: isClientAccessible(schema.key),
            examples: schema.examples,
        })),
    };

    return JSON.stringify(doc, null, 2);
}

/**
 * 카테고리별 그룹화
 */
function groupByCategory(schemas: EnvVarSchema[]): Record<string, EnvVarSchema[]>
{
    const groups: Record<string, EnvVarSchema[]> = {};

    for (const schema of schemas)
    {
        const category = schema.category || 'Other';
        if (!groups[category])
        {
            groups[category] = [];
        }
        groups[category].push(schema);
    }

    return groups;
}