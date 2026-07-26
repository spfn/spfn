---
title: Prototype to Production
navTitle: Prototype to Production
order: 1
description: Scaffold the full SPFN foundation, build with an agent, deploy it, and operate the product through MCP.
---

## The whole loop

Superfunction is designed for one continuous path:

```text
idea → full scaffold → vertical slices → production build → deploy → MCP operations
```

The framework does not decide what your product is. It gives humans and agents a
consistent place to put each part, plus the infrastructure and guardrails needed to
keep going after the prototype works.

## 1. Scaffold the production foundation

Use full mode for a product you want to take beyond the first demo:

```bash
pnpm dlx spfn@beta create my-app --mode full
cd my-app
```

Full mode installs and wires the baseline as one application:

- `@spfn/core` for the server, database, routes, codegen, and typed client,
- `@spfn/auth` for sessions, social login, and authorization,
- `@spfn/i18n` for application-owned translation catalogs, and
- `@spfn/mcp` for authenticated agent access to application operations.

Use `--mode bare` when you deliberately want only the core architecture. The
interactive prompt recommends full mode. Automated runs should pass the mode
explicitly; mode omission with `--yes` remains bare for backward compatibility.

For an existing Next.js app, use the corresponding init flow:

```bash
pnpm dlx spfn@beta init --mode full
```

## 2. Connect infrastructure and identity

Bring up the local services and start both sides of the app:

```bash
docker compose up -d
pnpm spfn:dev
```

The generated env examples separate browser-visible configuration from server-only
secrets. Add values only for the providers you use:

| Concern | What to connect |
| --- | --- |
| Data | PostgreSQL connection; Redis when the selected functions need it |
| Sessions | Auth session and token-encryption secrets |
| Social login | The client ID, client secret, and callback URL for each enabled provider |
| Storage and cloud | Credentials for the storage or infrastructure driver you select |
| Deployment | Public application and API origins used by redirects and server calls |

Keep real values out of source control. After deployment, update each OAuth provider's
allowed callback URL to the production application origin.

## 3. Give the agent a repeatable architecture

Ask the agent to build features as vertical slices and point it to
[The SPFN Pattern](./pattern.md):

```text
src/server/
  entities/order.ts
  repositories/order.ts
  routes/orders.ts
  router.ts
```

The entity owns the data shape, the repository owns persistence, the route owns the
validated API contract, and the router registers the slice. Generated files are output,
not editing targets. This is more valuable to an agent than a long prompt describing a
new architecture for every feature.

After changing routes or entities, close the loop with the project commands:

```bash
pnpm spfn codegen
pnpm spfn db generate       # when the schema changed
pnpm spfn build
pnpm test
```

Type safety is one guardrail in this loop, alongside runtime schemas, generated
migrations, explicit module boundaries, and repeatable verification.

## 4. Deploy one product, not a disconnected demo

A production SPFN app has three durable dependencies:

1. the Next.js process,
2. the SPFN server process, and
3. PostgreSQL, plus Redis when your selected functions require it.

Run `pnpm spfn build` before deployment. Configure the platform to start the generated
production application with `pnpm spfn start`, provide the same validated env contract
used locally, and expose the application and API origins over HTTPS. Apply generated
database migrations as a deliberate release step rather than writing production SQL by
hand.

The deployment target is your choice. The invariant is that the web app and SPFN server
ship from the same repository and are versioned together.

## 5. Turn domain operations into MCP tools

Do not expose tables as generic CRUD tools. Expose the operations an operator is
actually allowed to perform, using the same repositories and services as the product:

```text
customers.list
orders.refund
content.publish
workflow.retry
```

Each tool should have a narrow input schema, a clear authorization rule, and safe error
output. Mark read-only and destructive behavior accurately. Keep approval in front of
high-impact actions such as refunds, deletion, permission changes, or bulk updates.

`@spfn/mcp` serves the application-owned contract over authenticated Streamable HTTP.
The full scaffold starts with a generated `SPFN_MCP_API_KEY` Bearer token for first-party
operator access. This is separate from the social OAuth flow used to sign people into the
application. The protocol adapter handles MCP; your app still owns policy and business
logic. Read the [`@spfn/mcp` reference](./packages/mcp.md) before adding tools.

The operator key is the current baseline, not a permanent requirement. Replace the
generated `validateToken` implementation with your OAuth access-token validator when you
need third-party clients, delegated identity, or finer-grained scopes.

## 6. Connect the deployed app to an agent

After deployment:

1. Keep `SPFN_MCP_API_KEY` in the deployment platform's server-side secret manager.
2. Give the MCP client the HTTPS endpoint exposed by the app, normally `/mcp`.
3. Configure the client to send the operator key as an `Authorization: Bearer` token.
4. Start with the generated read-only `app_status` tool and verify its result.
5. Add mutating tools one at a time, with explicit authorization and approval policy.

Rotate the operator key like any production credential and never expose it to browser
code. Application users continue to sign in through the separately configured OAuth
providers. If the MCP endpoint later serves third-party clients, replace the key validator
with OAuth and grant only the scopes each client needs.

The result is an operating surface tailored to your product. An agent can inspect users,
publish content, or run a workflow without a separate administrator dashboard. Build a
dashboard later when a recurring human workflow benefits from one — not as a prerequisite
for operating the first production version.

## Production checklist

- The full scaffold runs locally with only the selected provider keys added.
- Every feature follows the entity → repository → route → router pattern.
- Codegen output and schema-generated migrations are current.
- Build, tests, and lint pass from a clean checkout.
- OAuth callbacks and public origins use production HTTPS URLs.
- The MCP operator key stays server-side and has a rotation path.
- MCP tools are task-specific, scoped, and safe by default.
- Destructive tools require an explicit authorization and approval path.
- Logs and tool results never expose secrets or sensitive internals.

Next, use the [full-stack auth tutorial](./tutorial.md) to understand the generated auth
boundary or browse [Packages](./packages.md) to add storage, notifications,
monitoring, CMS, and workflows without changing the architecture.
