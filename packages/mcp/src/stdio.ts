import { randomUUID } from 'node:crypto';
import type { Readable, Writable } from 'node:stream';
import {
    StdioServerTransport,
    serveStdio,
} from '@modelcontextprotocol/server/stdio';
import type {
    McpDispatchSession,
    McpDispatcher,
    McpProtocolEra,
} from './index';
import {
    createDispatcherServer,
    reportDispatcherError,
} from './dispatcher';

export type McpStdioConnectionInfo = {
    era: McpProtocolEra;
};

export type McpStdioSession<Auth, Ctx> = Omit<
    McpDispatchSession<Auth, Ctx>,
    'requestId'
> & {
    requestId?: string;
};

export type McpStdioOptions<Auth, Ctx> = {
    dispatcher: McpDispatcher<Auth, Ctx>;
    createSession: (
        connection: McpStdioConnectionInfo,
    ) => McpStdioSession<Auth, Ctx> | Promise<McpStdioSession<Auth, Ctx>>;
    stdin?: Readable;
    stdout?: Writable;
    stderr?: Writable;
    legacy?: 'serve' | 'reject';
    maxBufferSize?: number;
    maxSubscriptions?: number;
    signals?: false | readonly NodeJS.Signals[];
};

export type McpStdioHandle = {
    close: () => Promise<void>;
    closed: Promise<void>;
};

export function serveMcpStdio<Auth, Ctx>(
    options: McpStdioOptions<Auth, Ctx>,
): McpStdioHandle
{
    const stdin = options.stdin ?? process.stdin;
    const stdout = options.stdout ?? process.stdout;
    const stderr = options.stderr ?? process.stderr;
    const transport = new StdioServerTransport(
        stdin,
        stdout,
        { maxBufferSize: options.maxBufferSize },
    );
    const handle = serveStdio(
        async connection =>
        {
            const session = await options.createSession({ era: connection.era });

            return createDispatcherServer(options.dispatcher, {
                auth: session.auth,
                ctx: session.ctx,
                requestId: session.requestId ?? randomUUID(),
            });
        },
        {
            transport,
            legacy: options.legacy,
            maxSubscriptions: options.maxSubscriptions,
            onerror: error =>
            {
                writeDiagnostic(stderr, 'MCP stdio transport error');
                void reportDispatcherError(
                    options.dispatcher,
                    { operation: 'transport', error },
                );
            },
        },
    );
    let closing: Promise<void> | undefined;
    let resolveClosed: () => void = () =>
    {
        // Replaced when the lifecycle promise is constructed below.
    };
    const closed = new Promise<void>(resolve =>
    {
        resolveClosed = resolve;
    });
    const signals = options.signals === false
        ? []
        : [...(options.signals ?? ['SIGINT', 'SIGTERM'])];
    const close = (): Promise<void> =>
    {
        if (!closing)
        {
            cleanup();
            closing = handle.close().finally(resolveClosed);
        }

        return closing;
    };
    const requestClose = () => void close();
    const cleanup = () =>
    {
        stdin.off('end', requestClose);
        stdin.off('close', requestClose);
        stdin.off('error', requestClose);
        stdout.off('close', requestClose);
        stdout.off('error', requestClose);
        for (const signal of signals)
        {
            process.off(signal, requestClose);
        }
    };

    stdin.once('end', requestClose);
    stdin.once('close', requestClose);
    stdin.once('error', requestClose);
    stdout.once('close', requestClose);
    stdout.once('error', requestClose);
    for (const signal of signals)
    {
        process.once(signal, requestClose);
    }

    return { close, closed };
}

function writeDiagnostic(stderr: Writable, message: string): void
{
    try
    {
        stderr.write(`[spfn:mcp] ${message}\n`);
    }
    catch
    {
        // Diagnostics must never affect the protocol connection.
    }
}

export { McpError } from './index';
export type {
    McpDispatchSession,
    McpDispatcher,
    McpDispatcherConfig,
    McpErrorEvent,
    McpIcon,
    McpObjectSchema,
    McpPromptArgument,
    McpPromptDefinition,
    McpPromptMessage,
    McpPromptResult,
    McpResourceDefinition,
    McpResourceResult,
    McpServerInfo,
    McpTool,
    McpToolAnnotations,
    McpToolCallEvent,
} from './index';
