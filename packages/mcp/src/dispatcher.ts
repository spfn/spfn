import {
    McpServer,
    fromJsonSchema,
    isCallToolResult,
} from '@modelcontextprotocol/server';
import type { CallToolResult, JsonSchemaType } from '@modelcontextprotocol/server';
import {
    McpError,
    type McpDispatchSession,
    type McpDispatcher,
    type McpDispatcherConfig,
    type McpErrorEvent,
    type McpObjectSchema,
    type McpPromptDefinition,
    type McpTool,
} from './index';
import { dispatcherConfig } from './dispatcher-state';

export { createMcpDispatcher } from './dispatcher-state';

export async function createDispatcherServer<Auth, Ctx>(
    dispatcher: McpDispatcher<Auth, Ctx>,
    session: McpDispatchSession<Auth, Ctx>,
): Promise<McpServer>
{
    const config = dispatcherConfig(dispatcher);
    const server = new McpServer(config.serverInfo);
    await registerTools(server, config, session);
    await registerResources(server, config, session.ctx);
    await registerPrompts(server, config, session.ctx);

    return server;
}

export async function reportDispatcherError<Auth, Ctx>(
    dispatcher: McpDispatcher<Auth, Ctx>,
    event: McpErrorEvent,
): Promise<void>
{
    try
    {
        await dispatcherConfig(dispatcher).onError?.(event);
    }
    catch
    {
        // Error observers must not change protocol behavior.
    }
}

async function registerTools<Auth, Ctx>(
    server: McpServer,
    config: McpDispatcherConfig<Auth, Ctx>,
    session: McpDispatchSession<Auth, Ctx>,
): Promise<void>
{
    for (const tool of await config.listTools(session.ctx))
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
            args => invokeTool(config, tool, args, session),
        );
    }
}

async function invokeTool<Auth, Ctx>(
    config: McpDispatcherConfig<Auth, Ctx>,
    tool: McpTool<Ctx>,
    args: Record<string, unknown>,
    session: McpDispatchSession<Auth, Ctx>,
): Promise<CallToolResult>
{
    let ok = false;
    try
    {
        const result = await tool.handler(args, session.ctx);
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
        await emitToolCall(config, tool.name, ok, session);
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

async function emitToolCall<Auth, Ctx>(
    config: McpDispatcherConfig<Auth, Ctx>,
    toolName: string,
    ok: boolean,
    session: McpDispatchSession<Auth, Ctx>,
): Promise<void>
{
    try
    {
        await config.onToolCall?.({
            toolName,
            auth: session.auth,
            requestId: session.requestId,
            ok,
            ctx: session.ctx,
        });
    }
    catch (error)
    {
        await reportError(config, { operation: 'tool', name: toolName, error });
    }
}

async function registerResources<Auth, Ctx>(
    server: McpServer,
    config: McpDispatcherConfig<Auth, Ctx>,
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

async function registerPrompts<Auth, Ctx>(
    server: McpServer,
    config: McpDispatcherConfig<Auth, Ctx>,
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

function registerPrompt<Auth, Ctx>(
    server: McpServer,
    config: McpDispatcherConfig<Auth, Ctx>,
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

async function safeOperation<Auth, Ctx, Result>(
    config: McpDispatcherConfig<Auth, Ctx>,
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

async function reportError<Auth, Ctx>(
    config: McpDispatcherConfig<Auth, Ctx>,
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

function isRecord(value: unknown): value is Record<string, unknown>
{
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
