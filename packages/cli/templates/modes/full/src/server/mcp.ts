/**
 * Remote MCP endpoint for operating this application with an agent.
 *
 * The generated operator key makes the endpoint usable immediately. Replace
 * `validateToken` with your OAuth access-token validator before granting access
 * to third-party clients, and expose only tools the resolved operator may use.
 */
import { timingSafeEqual } from 'node:crypto';
import type { McpAuth, McpTool } from '@spfn/mcp';
import { createMcpRoute } from '@spfn/mcp/server';
import env from './config/env.config';

type OperatorAuth = McpAuth & {
    operatorId: string;
};

type OperatorContext = {
    operatorId: string;
};

const tools: McpTool<OperatorContext>[] = [
    {
        name: 'app_status',
        title: 'Application status',
        description: 'Check that the deployed application MCP endpoint is available.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
        },
        handler: async (_args, context) => ({
            status: 'ok',
            operatorId: context.operatorId,
        }),
    },
];

export const mcpRouter = createMcpRoute<OperatorAuth, OperatorContext>({
    appUrl: env.SPFN_MCP_URL,
    serverInfo: {
        name: 'spfn-app',
        version: '1.0.0',
        description: 'Operate this SPFN application with an agent.',
    },
    validateToken: async (token) =>
    {
        // The registry validates this required secret at startup. Its public
        // proxy type remains optional so schemas can also describe values that
        // are not required in every environment.
        if (!secretsMatch(token, env.SPFN_MCP_API_KEY!))
        {
            throw new Error('Invalid MCP access token');
        }

        return {
            clientId: 'operator-agent',
            operatorId: 'operator',
            scopes: ['operate'],
        };
    },
    resolveContext: async auth => ({ operatorId: auth.operatorId }),
    listTools: () => tools,
});

function secretsMatch(actual: string, expected: string): boolean
{
    const actualBytes = Buffer.from(actual);
    const expectedBytes = Buffer.from(expected);

    return actualBytes.length === expectedBytes.length
        && timingSafeEqual(actualBytes, expectedBytes);
}
