import { randomUUID } from 'node:crypto';
import {
    McpServer,
    createMcpHandler,
    fromJsonSchema,
    hostHeaderValidationResponse,
    isCallToolResult,
    isLegacyRequest,
    originValidationResponse,
} from '@modelcontextprotocol/server';
import type { AuthInfo, CallToolResult, JsonSchemaType } from '@modelcontextprotocol/server';
import { defineRouter, route } from '@spfn/core/route';
import type { RouteBuilderContext, RouteDef, Router } from '@spfn/core/route';
import {
    McpError,
    type McpAuth,
    type McpErrorEvent,
    type McpObjectSchema,
    type McpPromptDefinition,
    type McpRouteConfig,
    type McpTool,
} from './index';

type RuntimeState<Auth, Ctx> = {
    auth: Auth;
    ctx: Ctx;
    requestId: string;
};

const RUNTIME_STATE_KEY = 'spfn.runtime';

export function createMcpRoute<Auth extends McpAuth, Ctx>(
    config: McpRouteConfig<Auth, Ctx>,
): Router<Record<string, RouteDef>>
{
    const resource = resolveResource(config);
    const handler = createMcpHandler(
        request => createServer(config, runtimeState<Auth, Ctx>(request.authInfo)),
        {
            legacy: 'stateless',
            responseMode: config.responseMode ?? 'auto',
            onerror: error => void reportError(config, { operation: 'transport', error }),
        },
    );
    const handle = (c: RouteBuilderContext) => handleRequest(config, handler.fetch, resource, c);

    return defineRouter({
        mcpPost: route.post('/mcp').skip('*').handler(handle),
        mcpGet: route.get('/mcp').skip('*').handler(handle),
        mcpDelete: route.delete('/mcp').skip('*').handler(handle),
    });
}

function resolveResource<Auth extends McpAuth, Ctx>(config: McpRouteConfig<Auth, Ctx>): string
{
    const resource = typeof config.resource === 'function'
        ? config.resource(config.appUrl)
        : config.resource;

    return resource ?? `${config.appUrl.replace(/\/$/, '')}/mcp`;
}

async function handleRequest<Auth extends McpAuth, Ctx>(
    config: McpRouteConfig<Auth, Ctx>,
    fetch: ReturnType<typeof createMcpHandler>['fetch'],
    resource: string,
    c: RouteBuilderContext,
): Promise<Response>
{
    const request = c.raw.req.raw;
    const rejected = validateSource(config, request);
    if (rejected)
    {
        return rejected;
    }

    const bearer = bearerToken(request.headers.get('authorization'));
    if (!bearer)
    {
        return challenge(config);
    }

    const auth = await validateAuth(config, bearer, resource);
    if (!auth)
    {
        return challenge(config);
    }

    const requestId = randomUUID();
    const era = await isLegacyRequest(request) ? 'legacy' : 'modern';
    try
    {
        const ctx = await config.resolveContext(auth, { era, requestId, request });

        return fetch(request, {
            authInfo: toAuthInfo(auth, bearer, resource, { auth, ctx, requestId }),
        });
    }
    catch (error)
    {
        await reportError(config, { operation: 'context', error });

        return contextError(error);
    }
}

function validateSource<Auth extends McpAuth, Ctx>(
    config: McpRouteConfig<Auth, Ctx>,
    request: Request,
): Response | undefined
{
    const hostRejection = config.security?.allowedHosts
        ? hostHeaderValidationResponse(request, config.security.allowedHosts)
        : undefined;
    if (hostRejection)
    {
        return hostRejection;
    }

    return config.security?.allowedOrigins
        ? originValidationResponse(request, config.security.allowedOrigins)
        : undefined;
}

function bearerToken(header: string | null): string | undefined
{
    const match = header?.match(/^Bearer\s+(.+)$/i);

    return match?.[1];
}

async function validateAuth<Auth extends McpAuth, Ctx>(
    config: McpRouteConfig<Auth, Ctx>,
    token: string,
    resource: string,
): Promise<Auth | undefined>
{
    try
    {
        return await config.validateToken(token, resource);
    }
    catch
    {
        return undefined;
    }
}

function challenge<Auth extends McpAuth, Ctx>(config: McpRouteConfig<Auth, Ctx>): Response
{
    const metadataUrl = config.resourceMetadataUrl
        ?? `${config.appUrl.replace(/\/$/, '')}/.well-known/oauth-protected-resource`;

    return Response.json(
        { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Unauthorized' } },
        {
            status: 401,
            headers: {
                'WWW-Authenticate': `Bearer resource_metadata="${metadataUrl}"`,
            },
        },
    );
}

function toAuthInfo<Auth, Ctx>(
    auth: Auth & McpAuth,
    token: string,
    resource: string,
    state: RuntimeState<Auth, Ctx>,
): AuthInfo
{
    return {
        token,
        clientId: auth.clientId,
        scopes: auth.scopes,
        ...(auth.expiresAt === undefined ? {} : { expiresAt: auth.expiresAt }),
        resource: new URL(resource),
        extra: { [RUNTIME_STATE_KEY]: state },
    };
}

function runtimeState<Auth, Ctx>(authInfo: AuthInfo | undefined): RuntimeState<Auth, Ctx>
{
    const state = authInfo?.extra?.[RUNTIME_STATE_KEY];
    if (!state || typeof state !== 'object')
    {
        throw new Error('Missing SPFN MCP request state');
    }

    return state as RuntimeState<Auth, Ctx>;
}

async function createServer<Auth extends McpAuth, Ctx>(
    config: McpRouteConfig<Auth, Ctx>,
    state: RuntimeState<Auth, Ctx>,
): Promise<McpServer>
{
    const server = new McpServer(config.serverInfo);
    await registerTools(server, config, state);
    await registerResources(server, config, state.ctx);
    await registerPrompts(server, config, state.ctx);

    return server;
}

async function registerTools<Auth extends McpAuth, Ctx>(
    server: McpServer,
    config: McpRouteConfig<Auth, Ctx>,
    state: RuntimeState<Auth, Ctx>,
): Promise<void>
{
    for (const tool of await config.listTools(state.ctx))
    {
        server.registerTool(
            tool.name,
            {
                title: tool.title,
                description: tool.description,
                inputSchema: standardSchema<Record<string, unknown>>(tool.inputSchema),
                ...(tool.outputSchema
                    ? { outputSchema: standardSchema<Record<string, unknown>>(tool.outputSchema) }
                    : {}),
                annotations: tool.annotations,
                icons: tool.icons,
            },
            args => invokeTool(config, tool, args, state),
        );
    }
}

async function invokeTool<Auth extends McpAuth, Ctx>(
    config: McpRouteConfig<Auth, Ctx>,
    tool: McpTool<Ctx>,
    args: Record<string, unknown>,
    state: RuntimeState<Auth, Ctx>,
): Promise<CallToolResult>
{
    let ok = false;
    try
    {
        const result = await tool.handler(args, state.ctx);
        ok = true;

        return normalizeToolResult(result);
    }
    catch (error)
    {
        await reportError(config, { operation: 'tool', name: tool.name, error });

        return toolError(error);
    }
    finally
    {
        await emitToolCall(config, tool.name, ok, state);
    }
}

function normalizeToolResult(result: unknown): CallToolResult
{
    if (isCallToolResult(result))
    {
        return result;
    }
    const text = JSON.stringify(result) ?? 'null';

    return isRecord(result)
        ? { content: [{ type: 'text', text }], structuredContent: result }
        : { content: [{ type: 'text', text }] };
}

function toolError(error: unknown): CallToolResult
{
    return {
        content: [{
            type: 'text',
            text: error instanceof McpError ? error.message : 'Tool execution failed',
        }],
        isError: true,
    };
}

async function emitToolCall<Auth extends McpAuth, Ctx>(
    config: McpRouteConfig<Auth, Ctx>,
    toolName: string,
    ok: boolean,
    state: RuntimeState<Auth, Ctx>,
): Promise<void>
{
    try
    {
        await config.onToolCall?.({
            toolName,
            auth: state.auth,
            requestId: state.requestId,
            ok,
            ctx: state.ctx,
        });
    }
    catch (error)
    {
        await reportError(config, { operation: 'tool', name: toolName, error });
    }
}

async function registerResources<Auth extends McpAuth, Ctx>(
    server: McpServer,
    config: McpRouteConfig<Auth, Ctx>,
    ctx: Ctx,
): Promise<void>
{
    if (!config.resources)
    {
        return;
    }
    for (const resource of await config.resources.list(ctx))
    {
        server.registerResource(
            resource.name,
            resource.uri,
            {
                title: resource.title,
                description: resource.description,
                mimeType: resource.mimeType,
                icons: resource.icons,
            },
            async uri => safeOperation(
                config,
                { operation: 'resource', name: resource.uri },
                () => config.resources!.read(ctx, uri.href),
                'Resource read failed',
            ),
        );
    }
}

async function registerPrompts<Auth extends McpAuth, Ctx>(
    server: McpServer,
    config: McpRouteConfig<Auth, Ctx>,
    ctx: Ctx,
): Promise<void>
{
    if (!config.prompts)
    {
        return;
    }
    for (const prompt of await config.prompts.list(ctx))
    {
        registerPrompt(server, config, ctx, prompt);
    }
}

function registerPrompt<Auth extends McpAuth, Ctx>(
    server: McpServer,
    config: McpRouteConfig<Auth, Ctx>,
    ctx: Ctx,
    prompt: McpPromptDefinition,
): void
{
    const invoke = (args: Record<string, unknown>) => safeOperation(
        config,
        { operation: 'prompt' as const, name: prompt.name },
        () => config.prompts!.get(ctx, prompt.name, stringArguments(args)),
        'Prompt rendering failed',
    );
    const argsSchema = prompt.arguments?.length
        ? standardSchema<Record<string, string>>(promptSchema(prompt))
        : undefined;

    if (argsSchema)
    {
        server.registerPrompt(
            prompt.name,
            {
                title: prompt.title,
                description: prompt.description,
                argsSchema,
                icons: prompt.icons,
            },
            args => invoke(args),
        );

        return;
    }
    server.registerPrompt(
        prompt.name,
        {
            title: prompt.title,
            description: prompt.description,
            icons: prompt.icons,
        },
        () => invoke({}),
    );
}

function promptSchema(prompt: McpPromptDefinition): McpObjectSchema
{
    const args = prompt.arguments ?? [];

    return {
        type: 'object',
        properties: Object.fromEntries(args.map(arg => [arg.name, {
            type: 'string',
            ...(arg.description ? { description: arg.description } : {}),
        }])),
        required: args.filter(arg => arg.required).map(arg => arg.name),
        additionalProperties: false,
    };
}

function standardSchema<T>(schema: McpObjectSchema): ReturnType<typeof fromJsonSchema<T>>
{
    return fromJsonSchema<T>(schema as JsonSchemaType);
}

function stringArguments(args: Record<string, unknown>): Record<string, string>
{
    return Object.fromEntries(
        Object.entries(args).map(([key, value]) => [key, String(value)]),
    );
}

async function safeOperation<Auth extends McpAuth, Ctx, Result>(
    config: McpRouteConfig<Auth, Ctx>,
    event: Omit<McpErrorEvent, 'error'>,
    operation: () => Promise<Result>,
    fallback: string,
): Promise<Result>
{
    try
    {
        return await operation();
    }
    catch (error)
    {
        await reportError(config, { ...event, error });
        throw new Error(error instanceof McpError ? error.message : fallback);
    }
}

async function reportError<Auth extends McpAuth, Ctx>(
    config: McpRouteConfig<Auth, Ctx>,
    event: McpErrorEvent,
): Promise<void>
{
    try
    {
        await config.onError?.(event);
    }
    catch
    {
        // Error observers must not change protocol behavior.
    }
}

function contextError(error: unknown): Response
{
    const exposed = error instanceof McpError;

    return Response.json(
        {
            jsonrpc: '2.0',
            id: null,
            error: {
                code: exposed ? error.code : -32603,
                message: exposed ? error.message : 'Internal error',
            },
        },
        { status: exposed ? (error.httpStatus ?? 400) : 500 },
    );
}

function isRecord(value: unknown): value is Record<string, unknown>
{
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export { McpError } from './index';
export type {
    McpAuth,
    McpErrorEvent,
    McpIcon,
    McpObjectSchema,
    McpPromptArgument,
    McpPromptDefinition,
    McpPromptMessage,
    McpPromptResult,
    McpProtocolEra,
    McpRequestInfo,
    McpResourceDefinition,
    McpResourceResult,
    McpRouteConfig,
    McpServerInfo,
    McpTool,
    McpToolAnnotations,
    McpToolCallEvent,
} from './index';
