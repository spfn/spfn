# @spfn/mcp

`@spfn/mcp` serves one application-defined Model Context Protocol contract over remote
Streamable HTTP or local stdio. The official MCP TypeScript SDK handles protocol
negotiation, JSON-RPC, schema validation, and legacy compatibility. This package supplies
a transport-neutral dispatcher, an OAuth-protected SPFN route adapter, and a local stdio
bridge with application-facing tool, resource, prompt, and lifecycle hooks.

The package is currently beta and requires Node.js 20 or newer. It pins the MCP v2 beta
while the `2026-07-28` protocol release is being finalized. Its public SPFN API does not
expose SDK-specific server or transport objects, so the SDK can be upgraded without
rewriting application routes.

Use Streamable HTTP when an MCP client connects over a network and needs OAuth, Host, and
Origin validation. Use stdio when an Agent host starts a local child process and process
spawn authority is the trust boundary. A stdio bridge should remain thin: inject a client
for the already-running local daemon instead of opening a second database connection or
mutating domain files itself.

## Migrating from 0.1

Version `0.2` is a deliberate breaking redesign of the hand-written protocol stack in
`0.1`. The SPFN router mount remains the same, but its configuration needs these changes:

- Remove `signer`, `session`, and `protocolVersion`. Protocol negotiation and legacy
  transport compatibility now belong to the official SDK.
- Extend `McpAuth` with application claims such as `userId` or `grantId`; those fields are
  no longer prescribed by the package.
- Change `resolveContext(auth, session)` to `resolveContext(auth, request)`. Use
  `request.requestId` for log and usage correlation. It is not a durable session ID.
- Change `onToolCall` consumers from `event.sessionId` to `event.requestId`.
- Move skill definitions and grant, catalog, billing, and rate-limit policy into the
  consuming application. The old `./skills`, `./server/*`, and `./shared/*` internals are
  not exported by `0.2`.

Applications can keep their existing `defineRouter(...).packages([mcpRouter])` mount and
their existing `listTools` filtering boundary. If application state must survive multiple
tool calls, pass an explicit application-owned handle as a tool argument.

## Install

```bash
pnpm add @spfn/mcp @spfn/core
```

`@spfn/core` is only required for the HTTP route. A stdio-only bridge does not import it.

## Define a transport-neutral dispatcher

The dispatcher owns tool, resource, and prompt registration plus the shared validation and
error policy. It does not authenticate a network request or read process streams.

```ts
import { createMcpDispatcher } from '@spfn/mcp/dispatcher';

const dispatcher = createMcpDispatcher<Authority, Context>({
    serverInfo: { name: 'example-app', version: '1.0.0' },
    listTools: () => tools,
    resources: {
        list: ctx => listResources(ctx),
        read: (ctx, uri) => readResource(ctx, uri),
    },
    prompts: {
        list: ctx => listPrompts(ctx),
        get: (ctx, name, args) => renderPrompt(ctx, name, args),
    },
});
```

The same dispatcher can be passed to `createMcpHttpRoute` and `serveMcpStdio`. The older
`createMcpRoute` convenience API remains compatible and creates the dispatcher internally.

## Remote Streamable HTTP

```ts
import { createMcpRoute, McpError } from '@spfn/mcp/server';
import type { McpAuth, McpTool } from '@spfn/mcp';

type Auth = McpAuth & {
    userId: number;
};

type Context = {
    userId: number;
};

const tools: McpTool<Context>[] = [{
    name: 'greet',
    title: 'Greet user',
    description: 'Create a greeting for the current user.',
    inputSchema: {
        type: 'object',
        properties: {
            name: { type: 'string' },
        },
        required: ['name'],
    },
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
    },
    handler: async (args, ctx) => ({
        greeting: `Hello ${String(args.name)}`,
        userId: ctx.userId,
    }),
}];

export const mcpRouter = createMcpRoute<Auth, Context>({
    appUrl: 'https://app.example.com',
    serverInfo: {
        name: 'example-app',
        version: '1.0.0',
    },
    validateToken: async (token, resource) => {
        const claims = await verifyAccessToken(token, resource);
        return {
            clientId: claims.clientId,
            scopes: claims.scopes,
            expiresAt: claims.expiresAt,
            userId: claims.userId,
        };
    },
    resolveContext: async auth => {
        const user = await findUser(auth.userId);
        if (!user) {
            throw new McpError(-32002, 'User not found', 403);
        }
        return { userId: user.id };
    },
    listTools: () => tools,
});
```

Register the package router with the application router:

```ts
import { defineRouter } from '@spfn/core/route';
import { mcpRouter } from './mcp';

export const appRouter = defineRouter({
    // Application routes
}).packages([mcpRouter]);
```

The adapter registers `POST`, `GET`, and `DELETE` handlers at `/mcp` and skips SPFN's
session middleware. `validateToken` is therefore the authentication boundary and must
validate the token audience against the supplied `resource` value.

To reuse an existing dispatcher, use the explicit HTTP adapter:

```ts
import { createMcpHttpRoute } from '@spfn/mcp/server';

export const mcpRouter = createMcpHttpRoute({
    dispatcher,
    appUrl: 'https://app.example.com',
    validateToken,
    resolveContext,
});
```

## Local stdio

```ts
import { createMcpDispatcher } from '@spfn/mcp/dispatcher';
import { serveMcpStdio } from '@spfn/mcp/stdio';

const daemonClient = createLocalDaemonClient();
const dispatcher = createMcpDispatcher<LocalAuthority, LocalDaemonClient>({
    serverInfo: { name: 'local-workspace', version: '1.0.0' },
    listTools: () => [{
        name: 'greet',
        inputSchema: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
        },
        handler: (args, daemon) => daemon.greet(String(args.name)),
    }],
});

const bridge = serveMcpStdio({
    dispatcher,
    createSession: () => ({
        auth: { transport: 'stdio' },
        ctx: daemonClient,
    }),
});

await bridge.closed;
```

`serveMcpStdio` writes MCP frames only to stdout. Transport diagnostics use stderr and do
not include the rejected frame or handler exception. EOF, stdin/stdout disconnect,
`SIGINT`, `SIGTERM`, and an explicit `bridge.close()` all close the MCP server and transport
gracefully. Set `signals: false` only when an embedding process owns signal handling.

stdio does not run OAuth. The Agent host deciding which executable and arguments to spawn
is the authorization boundary, so protect the executable and its configuration as local
capabilities. See [`examples/stdio-bridge.ts`](./examples/stdio-bridge.ts) for a thin bridge
that delegates every domain operation to an injected daemon client.

## Package entry points

- `@spfn/mcp` — shared public types and `McpError`
- `@spfn/mcp/dispatcher` — transport-neutral dispatcher
- `@spfn/mcp/server` — OAuth Streamable HTTP adapters for SPFN
- `@spfn/mcp/stdio` — Node.js stdio bridge and lifecycle handle

## Request context

`resolveContext` receives the validated application auth value and request metadata:

```ts
resolveContext: async (auth, request) => ({
    userId: auth.userId,
    protocolEra: request.era,       // "legacy" or "modern"
    requestId: request.requestId,   // correlation ID, not a protocol session ID
});
```

The modern MCP protocol is request-scoped and does not use `Mcp-Session-Id`. Applications
that need durable conversational state should expose an explicit application session or
handle as a tool argument instead of relying on transport state. Legacy 2025 clients are
served through the official SDK's stateless compatibility path.

## Tool results and errors

Plain handler values are returned as text and, for objects, as structured content. A handler
may also return a valid MCP `CallToolResult`; the adapter recognizes it without changing it.

Only `McpError` messages are exposed to MCP clients. Other exceptions become
`Tool execution failed`. Use `onError` for internal reporting and keep secrets out of error
objects and logs.

```ts
onError: async event => {
    await reportMcpFailure(event.operation, event.name);
},
onToolCall: async event => {
    await recordUsage(event.toolName, event.ok, event.requestId);
},
```

## Host and Origin validation

Remote deployments should validate Host and Origin at the reverse proxy or configure
allowlists in the adapter:

```ts
security: {
    allowedHosts: ['app.example.com'],
    allowedOrigins: ['app.example.com'],
},
```

Allowlist values are hostnames without a scheme or port.

## Scope

This package intentionally does not provide an application catalog, grants, billing,
rate limits, a skill registry, or tool discovery policy. Resolve those in application code
and return only the tools the authenticated context may use from `listTools`.
