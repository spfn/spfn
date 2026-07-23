# @spfn/mcp

`@spfn/mcp` mounts an OAuth-protected Model Context Protocol endpoint in an SPFN
application. The official MCP TypeScript SDK handles protocol negotiation, JSON-RPC,
Streamable HTTP, schema validation, and legacy compatibility. This package supplies the
SPFN route adapter and application-facing tool, resource, prompt, and authentication hooks.

The package is currently beta and requires Node.js 20 or newer. It pins the MCP v2 beta
while the `2026-07-28` protocol release is being finalized. Its public SPFN API does not
expose SDK-specific server or transport objects, so the SDK can be upgraded without
rewriting application routes.

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

## Create a route

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
