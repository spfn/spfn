# The health endpoint moved to `/_core/health`

`@spfn/core` used to serve its built-in health endpoint at `/health`. It no longer does.
The endpoint answers at **`/_core/health`**, and `/health` belongs to your app.

If nothing in your deployment probes `/health`, there is nothing to do.

## Does this affect me?

| What you have | What to do |
|---|---|
| A readiness/liveness probe, `HEALTHCHECK`, uptime monitor or load balancer target on `/health` | [Move it](#1-move-the-probe-preferred), or [restore the old address](#2-restore-the-old-address) |
| `healthCheck({ path: '/healthz' })` or any other custom path | Nothing — a configured path still answers, and now `/_core/health` does too |
| `healthCheck({ enabled: false })` | Nothing — `/health` was already a 404 for you |
| Your own `GET /health` route | Nothing — it now answers, and used to be unreachable. See [below](#your-own-health-route-now-runs) |
| Nothing probing `/health` | Nothing |

The fastest way to check a running deployment:

```bash
curl -i https://your-app.example.com/health
```

`410 Gone` means it is on a release that moved the endpoint and nothing in the app claims
that path. The response body names the new address.

## What you will see if you miss this

The probe fails, the pod never enters rotation, and a Kubernetes event says only that the
probe failed — no response body, no status text. That is why the old path answers `410`
for one release instead of a bare `404`, and why the server logs this the first time it is
hit:

```
⚠️  GET /health is answering 410: @spfn/core no longer serves it. Point your readiness
probe, Dockerfile HEALTHCHECK and load balancer at /_core/health, or restore this path
with healthCheck({ path: '/health' }). This notice is removed in the next release.
```

The warning is logged once per server, not once per probe interval.

## 1. Move the probe (preferred)

`/_core/` belongs to `@spfn/core`. Paths in it are registered before your app's routes, so
no route you declare can take one — the address stays true through every later release, and
through whatever your app grows into.

Kubernetes:

```yaml
readinessProbe:
  httpGet:
    path: /_core/health   # was: /health
    port: 8790
```

Dockerfile:

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8790/_core/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"
```

Check every place a path is written down. A probe path lives in more files than it feels
like: the manifest, the Dockerfile, `docker-compose.yml`, a load balancer target group, an
uptime monitor, and whatever dashboards alert on it.

## 2. Restore the old address

When the probe path is frozen somewhere you cannot reach — a load balancer console owned
by another team, an appliance, a contract with a platform — ask for `/health` back:

```typescript
export default defineServerConfig()
    .healthCheck({ path: '/health' })
    .build();
```

The built-in then answers on both `/_core/health` and `/health`. This is an addition, not a
move: `/_core/health` answers either way.

One constraint. The configured path is registered **before** your app's routes, so if your
app also declares `GET /health` that route will not run, and the server says so at boot.
Pick one — the built-in there, or your own route there.

## Your own `/health` route now runs

If your app declares `GET /health`, that handler used to be unreachable: the built-in was
registered first and Hono never got past it. Nothing warned you loudly enough. Now the
route is simply yours.

That is a behaviour change worth checking. If a probe points at `/health` and your app has
such a route, the probe now reads **your handler's** response. Make sure it answers 200, or
move the probe to `/_core/health`.

## Why the endpoint moved at all

A readiness probe's path is fixed in places the framework cannot change: a GitOps
manifest, a Dockerfile, a load balancer's console. A version bump migrates none of them.
So the endpoint needs one address that is true regardless of what an app declares — and
`/health` could never be that, because it is an ordinary path an app has every right to
want.

The old arrangement forced a choice between two bad outcomes: the built-in wins and an
app's own `/health` route silently never runs, or the app wins and probes break depending
on what the app happens to define. Splitting the two addresses removes the choice.
`/_auth/` and `/_ops/` have worked this way since they existed, and neither has ever had a
shadowing defect.
