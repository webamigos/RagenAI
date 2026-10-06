# MCP OAuth client retention

Run this daily on installations with `MCP_OAUTH_ENABLED=true`:

```sh
npm run mcp:prune-clients --workspace=@ragenai/web
```

Run from the repository root with dependencies installed. The command loads
root and web `.env.local` files when present; deployment environment values take
precedence. It uses the web service's database and public MCP configuration.
For a scheduler, set the working directory to the checkout and use the same
secret environment as web. For example, a daily cron entry for a checkout at
`/srv/ragen-app` is:

```cron
45 3 * * * cd /srv/ragen-app && npm run mcp:prune-clients --workspace=@ragenai/web
```

Register one schedule per installation. The command runs once and exits;
starting a second copy is safe but adds avoidable database contention. Follow
the scheduler's existing failure notifications. A failed run retains clients;
the next run uses a fresh cutoff and catches up.

The deployment gate defaults off, and the command then reports
`{"disabled":true,"deleted":0}` without querying OAuth tables. When enabled,
it deletes anonymous clients created more than 30 days ago that have no
consent, access token or refresh token. Registration-time resource bindings are
removed in the same transaction as an unused client. A
client owned by a user, a client with an unknown creation date, and every
client with a consent are preserved. Scope selection cannot bypass retention.

All OAuth queries and deletes go through the provider's Better Auth adapter.
Serializable isolation protects a concurrent first consent from the client's
cascading deletion. Serialization conflicts retry up to three attempts; other
failures exit nonzero. The command logs counts and cutoff only, never tokens.
Cursor pagination continues across deleted pages without skipping clients.

Rollback by removing the schedule. Keep OAuth deployment and organization gates
disabled until the complete deployed client flow has been verified. This task
does not revoke active grants and does not enable either gate.
