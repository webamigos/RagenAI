import { listCatalogueEntriesAction } from './actions';
import type { CatalogueEntryView } from './catalogue-view';

export const dynamic = 'force-dynamic';

const AUTH_TYPE_LABELS: Record<string, string> = {
  SERVER_SIDE: 'Server-side',
  API_KEY_BEARER: 'API key (bearer)',
  EXTERNAL_MCP: 'OAuth (external MCP)',
  API_KEY_CUSTOM_HEADER: 'API key (custom header)',
  OAUTH: 'OAuth',
  API_KEY: 'API key',
};

function ServerUrlCell({ view }: { view: CatalogueEntryView }) {
  if (view.serverUrlSource === 'per-connector') {
    return (
      <span className="text-muted-foreground">
        Per connector — assembled from the shop URL the user enters
      </span>
    );
  }

  if (!view.serverUrl) {
    return <span className="text-muted-foreground">Not set</span>;
  }

  return (
    <div className="space-y-1">
      <code className="break-all text-xs">{view.serverUrl}</code>
      {view.serverUrlVariable ? (
        <div className="text-xs text-muted-foreground">
          From {view.serverUrlVariable}
        </div>
      ) : null}
    </div>
  );
}

function OrganizationsCell({ view }: { view: CatalogueEntryView }) {
  if (!view.entry.enabled) {
    return <span className="text-muted-foreground">None — entry disabled</span>;
  }

  if (view.organizations === null) {
    return <span>All organizations</span>;
  }

  if (view.organizations.length === 0) {
    return (
      <span className="text-muted-foreground">
        No organization — not on any allowlist
      </span>
    );
  }

  const names = view.organizations.map((org) => org.name);
  return (
    <span title={names.join(', ')}>
      {names.length <= 3
        ? names.join(', ')
        : `${names.slice(0, 3).join(', ')} +${names.length - 3} more`}
    </span>
  );
}

export default async function McpCataloguePage() {
  const entries = await listCatalogueEntriesAction();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">MCP Catalogue</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Every service this installation can connect to. The eleven that ship
          with Ragen are marked built-in: their server address stays in the
          environment, because a database promoted between environments would
          otherwise point them at the wrong host.
        </p>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          This page is read-only for now. Which organizations may use an entry
          is set on{' '}
          <a href="/connectors" className="text-primary hover:underline">
            Connectors
          </a>
          .
        </p>
      </div>

      <div className="rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Connector</th>
              <th className="px-4 py-3 text-left font-medium">Auth</th>
              <th className="px-4 py-3 text-left font-medium">Server</th>
              <th className="px-4 py-3 text-left font-medium">Origin</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Available to</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((view) => (
              <tr
                key={view.entry.publicId}
                className="border-b border-border last:border-0 transition-colors hover:bg-muted/50"
              >
                <td className="px-4 py-3">
                  <div className="font-medium">{view.entry.label}</div>
                  <code className="text-xs text-muted-foreground">
                    {view.entry.slug}
                  </code>
                </td>
                <td className="px-4 py-3">
                  {AUTH_TYPE_LABELS[view.entry.authType] ?? view.entry.authType}
                </td>
                <td className="px-4 py-3">
                  <ServerUrlCell view={view} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {view.entry.isBuiltIn ? 'Built-in' : 'Added here'}
                </td>
                <td className="px-4 py-3">
                  {view.entry.enabled ? 'Enabled' : 'Disabled'}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <OrganizationsCell view={view} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {entries.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            The catalogue is empty. A fresh installation is seeded with the
            built-in connectors by the migration that creates the table — if
            this list is empty, that migration has not run.
          </p>
        ) : null}
      </div>
    </div>
  );
}
