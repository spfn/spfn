import { randomUUID } from 'node:crypto';
import {
    createMcpHandler,
    hostHeaderValidationResponse,
    isLegacyRequest,
    originValidationResponse,
} from '@modelcontextprotocol/server';
import type { AuthInfo } from '@modelcontextprotocol/server';
import { defineRouter, route } from '@spfn/core/route';
import type { RouteBuilderContext, RouteDef, Router } from '@spfn/core/route';
import {
    McpError,
    type McpAuth,
    type McpHttpRouteConfig,
    type McpRouteConfig,
} from './index';
import {
    createDispatcherServer,
    createMcpDispatcher,
    reportDispatcherError,
} from './dispatcher';

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
    return createMcpHttpRoute({
        ...config,
        dispatcher: createMcpDispatcher(config),
    });
}

export function createMcpHttpRoute<Auth extends McpAuth, Ctx>(
    config: McpHttpRouteConfig<Auth, Ctx>,
): Router<Record<string, RouteDef>>
{
    const resource = resolveResource(config);
    const handler = createMcpHandler(
        request => createDispatcherServer(
            config.dispatcher,
            runtimeState<Auth, Ctx>(request.authInfo),
        ),
        {
            legacy: 'stateless',
            responseMode: config.responseMode ?? 'auto',
            onerror: error => void reportDispatcherError(
                config.dispatcher,
                { operation: 'transport', error },
            ),
        },
    );
    const handle = (c: RouteBuilderContext) => handleRequest(
        config,
        handler.fetch,
        resource,
        c,
    );

    return defineRouter({
        mcpPost: route.post('/mcp').skip('*').handler(handle),
        mcpGet: route.get('/mcp').skip('*').handler(handle),
        mcpDelete: route.delete('/mcp').skip('*').handler(handle),
    });
}

function resolveResource<Auth extends McpAuth, Ctx>(config: McpHttpRouteConfig<Auth, Ctx>): string
{
    const resource = typeof config.resource === 'function'
        ? config.resource(config.appUrl)
        : config.resource;

    return resource ?? `${config.appUrl.replace(/\/$/, '')}/mcp`;
}

async function handleRequest<Auth extends McpAuth, Ctx>(
    config: McpHttpRouteConfig<Auth, Ctx>,
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
        await reportDispatcherError(config.dispatcher, { operation: 'context', error });

        return contextError(error);
    }
}

function validateSource<Auth extends McpAuth, Ctx>(
    config: McpHttpRouteConfig<Auth, Ctx>,
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
    config: McpHttpRouteConfig<Auth, Ctx>,
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

function challenge<Auth extends McpAuth, Ctx>(config: McpHttpRouteConfig<Auth, Ctx>): Response
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

export { McpError } from './index';
export type {
    McpAuth,
    McpHttpRouteConfig,
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
