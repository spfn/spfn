import { PassThrough } from 'node:stream';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { registerRoutes } from '@spfn/core/route';
import { createMcpDispatcher } from '../dispatcher';
import { createMcpHttpRoute } from '../server';
import { serveMcpStdio } from '../stdio';
import type { McpErrorEvent } from '../index';

type TestAuth = {
    clientId: string;
    scopes: string[];
    source: 'http' | 'stdio';
};

type TestContext = {
    prefix: string;
};

type JsonRpcMessage = {
    id?: number | string | null;
    method?: string;
    result?: Record<string, unknown>;
    error?: Record<string, unknown>;
};

function createDispatcher(options: {
    onError?: (event: McpErrorEvent) => void;
    throwingTool?: boolean;
} = {})
{
    return createMcpDispatcher<TestAuth, TestContext>({
        serverInfo: { name: 'stdio-test', version: '1.0.0' },
        listTools: () => [{
            name: 'echo',
            description: 'Echo through the shared dispatcher',
            inputSchema: {
                type: 'object',
                properties: { message: { type: 'string' } },
                required: ['message'],
                additionalProperties: false,
            },
            handler: async (args, ctx) =>
            {
                if (options.throwingTool)
                {
                    throw new Error('private daemon detail');
                }

                return { message: `${ctx.prefix}${String(args.message)}` };
            },
        }],
        resources: {
            list: () => [{ name: 'status', uri: 'local://daemon/status' }],
            read: async (_ctx, uri) => ({
                contents: [{ uri, text: 'ready' }],
            }),
        },
        prompts: {
            list: () => [{
                name: 'greet',
                arguments: [{ name: 'name', required: true }],
            }],
            get: async (_ctx, _name, args) => ({
                messages: [{
                    role: 'user',
                    content: { type: 'text', text: `Hello ${args.name}` },
                }],
            }),
        },
        onError: options.onError,
    });
}

function createHarness(
    dispatcher = createDispatcher(),
    options: { maxBufferSize?: number } = {},
)
{
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const messages: JsonRpcMessage[] = [];
    let protocolOutput = '';
    let diagnosticOutput = '';
    let pending = '';
    stdout.on('data', chunk =>
    {
        const text = chunk.toString();
        protocolOutput += text;
        pending += text;
        const lines = pending.split('\n');
        pending = lines.pop() ?? '';
        for (const line of lines)
        {
            if (line)
            {
                messages.push(JSON.parse(line) as JsonRpcMessage);
            }
        }
    });
    stderr.on('data', chunk =>
    {
        diagnosticOutput += chunk.toString();
    });
    const handle = serveMcpStdio({
        dispatcher,
        createSession: ({ era }) => ({
            auth: { clientId: 'local-process', scopes: [], source: 'stdio' as const },
            ctx: { prefix: `${era}:` },
            requestId: 'stdio-request',
        }),
        stdin,
        stdout,
        stderr,
        signals: false,
        maxBufferSize: options.maxBufferSize,
    });

    const send = async (message: Record<string, unknown>): Promise<JsonRpcMessage> =>
    {
        const id = message.id;
        stdin.write(`${JSON.stringify(message)}\n`);
        await vi.waitFor(() =>
        {
            expect(messages.some(candidate => candidate.id === id)).toBe(true);
        });

        return messages.find(candidate => candidate.id === id)!;
    };
    const notify = (message: Record<string, unknown>) =>
    {
        stdin.write(`${JSON.stringify(message)}\n`);
    };

    return {
        stdin,
        messages,
        handle,
        send,
        notify,
        protocolOutput: () => protocolOutput,
        diagnosticOutput: () => diagnosticOutput,
        pendingOutput: () => pending,
    };
}

async function initialize(harness: ReturnType<typeof createHarness>): Promise<void>
{
    const response = await harness.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' },
        },
    });
    expect(response.result).toMatchObject({
        protocolVersion: '2025-11-25',
        serverInfo: { name: 'stdio-test' },
    });
    harness.notify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
    });
}

function readSseMessage(body: string): JsonRpcMessage
{
    const data = body
        .split('\n')
        .find(line => line.startsWith('data: '))
        ?.slice('data: '.length);

    if (!data)
    {
        throw new Error('SSE response did not contain a data event');
    }

    return JSON.parse(data) as JsonRpcMessage;
}

describe('transport-neutral MCP dispatcher', () =>
{
    it('returns the same tool result through HTTP and stdio', async () =>
    {
        const dispatcher = createDispatcher();
        const app = new Hono();
        registerRoutes(app, createMcpHttpRoute({
            dispatcher,
            appUrl: 'https://example.com',
            validateToken: async () => ({
                clientId: 'remote-client',
                scopes: ['tools'],
                source: 'http',
            }),
            resolveContext: async () => ({ prefix: 'legacy:' }),
        }));
        const httpResponse = await app.request('/mcp', {
            method: 'POST',
            headers: {
                authorization: 'Bearer valid-token',
                accept: 'application/json, text/event-stream',
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 9,
                method: 'tools/call',
                params: { name: 'echo', arguments: { message: 'hello' } },
            }),
        });
        const httpMessage = readSseMessage(await httpResponse.text());
        const harness = createHarness(dispatcher);
        await initialize(harness);
        const stdioMessage = await harness.send({
            jsonrpc: '2.0',
            id: 9,
            method: 'tools/call',
            params: { name: 'echo', arguments: { message: 'hello' } },
        });

        expect(httpMessage.result?.structuredContent).toEqual({ message: 'legacy:hello' });
        expect(stdioMessage.result?.structuredContent).toEqual({ message: 'legacy:hello' });
        await harness.handle.close();
    });
});

describe('serveMcpStdio', () =>
{
    it('serves tools, resources, and prompts and writes protocol frames only to stdout', async () =>
    {
        const harness = createHarness();
        await initialize(harness);

        const tools = await harness.send({
            jsonrpc: '2.0', id: 2, method: 'tools/list', params: {},
        });
        const resources = await harness.send({
            jsonrpc: '2.0', id: 3, method: 'resources/list', params: {},
        });
        const resource = await harness.send({
            jsonrpc: '2.0',
            id: 4,
            method: 'resources/read',
            params: { uri: 'local://daemon/status' },
        });
        const prompts = await harness.send({
            jsonrpc: '2.0', id: 5, method: 'prompts/list', params: {},
        });
        const prompt = await harness.send({
            jsonrpc: '2.0',
            id: 6,
            method: 'prompts/get',
            params: { name: 'greet', arguments: { name: 'Ada' } },
        });
        const tool = await harness.send({
            jsonrpc: '2.0',
            id: 7,
            method: 'tools/call',
            params: { name: 'echo', arguments: { message: 'hello' } },
        });

        expect(tools.result?.tools).toEqual([
            expect.objectContaining({ name: 'echo' }),
        ]);
        expect(resources.result?.resources).toEqual([
            expect.objectContaining({ uri: 'local://daemon/status' }),
        ]);
        expect(resource.result?.contents).toEqual([
            expect.objectContaining({ text: 'ready' }),
        ]);
        expect(prompts.result?.prompts).toEqual([
            expect.objectContaining({ name: 'greet' }),
        ]);
        expect(prompt.result?.messages).toEqual([
            expect.objectContaining({ content: expect.objectContaining({ text: 'Hello Ada' }) }),
        ]);
        expect(tool.result?.structuredContent).toEqual({ message: 'legacy:hello' });
        expect(harness.diagnosticOutput()).toBe('');
        expect(harness.pendingOutput()).toBe('');
        for (const line of harness.protocolOutput().trimEnd().split('\n'))
        {
            expect(() => JSON.parse(line)).not.toThrow();
        }

        await harness.handle.close();
        await expect(harness.handle.closed).resolves.toBeUndefined();
    });

    it('closes gracefully when stdin reaches EOF', async () =>
    {
        const harness = createHarness();
        await initialize(harness);

        harness.stdin.end();

        await expect(harness.handle.closed).resolves.toBeUndefined();
    });

    it('closes after a fatal transport error', async () =>
    {
        const errors: McpErrorEvent[] = [];
        const harness = createHarness(
            createDispatcher({ onError: event => void errors.push(event) }),
            { maxBufferSize: 1 },
        );

        harness.stdin.write('{}\n');

        await expect(harness.handle.closed).resolves.toBeUndefined();
        expect(errors).toContainEqual(expect.objectContaining({ operation: 'transport' }));
        expect(harness.diagnosticOutput()).toBe('[spfn:mcp] MCP stdio transport error\n');
    });

    it('matches argument validation and redacts handler failures', async () =>
    {
        const errors: McpErrorEvent[] = [];
        const harness = createHarness(createDispatcher({
            throwingTool: true,
            onError: event => void errors.push(event),
        }));
        await initialize(harness);

        const invalid = await harness.send({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: { name: 'echo', arguments: {} },
        });
        const failed = await harness.send({
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: { name: 'echo', arguments: { message: 'hello' } },
        });

        expect(invalid.result).toMatchObject({ isError: true });
        expect(JSON.stringify(invalid)).toContain("required property 'message'");
        expect(JSON.stringify(failed)).toContain('Tool execution failed');
        expect(harness.protocolOutput()).not.toContain('private daemon detail');
        expect(errors).toEqual([
            expect.objectContaining({ operation: 'tool', name: 'echo' }),
        ]);
        await harness.handle.close();
    });

    it('rejects JSON-RPC batches without leaking their content to stdout or stderr', async () =>
    {
        const errors: McpErrorEvent[] = [];
        const harness = createHarness(createDispatcher({
            onError: event => void errors.push(event),
        }));

        harness.stdin.write(`${JSON.stringify([{
            jsonrpc: '2.0',
            id: 99,
            method: 'tools/call',
            params: { secret: 'do-not-echo' },
        }])}\n`);
        await vi.waitFor(() =>
        {
            expect(errors).toHaveLength(1);
        });

        expect(harness.protocolOutput()).toBe('');
        expect(harness.diagnosticOutput()).toBe('[spfn:mcp] MCP stdio transport error\n');
        expect(harness.diagnosticOutput()).not.toContain('do-not-echo');
        await harness.handle.close();
    });
});
