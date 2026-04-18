import { prisma } from '@/lib/db';
import { SearchableSelect } from '@/app/components/SearchableSelect';
import { DefaultConnectorsForm } from './DefaultConnectorsForm';
import { OrgConnectorsForm } from './OrgConnectorsForm';
import { getDefaultAllowedConnectorsAction } from './actions';
import { allConnectors } from './connectors-config';

export const dynamic = 'force-dynamic';

interface SearchParams {
  orgId?: string;
}

async function getOrgsWithConnectors() {
  return prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      settings: {
        select: {
          allowedConnectors: true,
        },
      },
      _count: { select: { members: true } },
    },
    orderBy: { name: 'asc' },
  });
}

function formatAllowedConnectors(allowed: string[] | undefined): string {
  if (!allowed || allowed.length === 0) {
    return 'All (inherited)';
  }
  const labels = allowed.map((value) => {
    const conn = allConnectors.find((c) => c.value === value);
    return conn?.label ?? value;
  });
  if (labels.length <= 3) {
    return labels.join(', ');
  }
  return `${labels.slice(0, 3).join(', ')} +${labels.length - 3} more`;
}

export default async function ConnectorsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const [orgs, defaults] = await Promise.all([
    getOrgsWithConnectors(),
    getDefaultAllowedConnectorsAction(),
  ]);

  const selectedOrg = params.orgId
    ? orgs.find((o) => o.id === params.orgId)
    : null;

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Connectors Management</h1>

      {/* Default Allowed Connectors */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-xl font-semibold">
          Default Allowed Connectors (for new organizations)
        </h2>
        <DefaultConnectorsForm defaults={defaults} />
      </div>

      {/* Per-org Allowed Connectors */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-xl font-semibold">
          Organization Allowed Connectors
        </h2>
        <form className="mb-6 flex gap-2">
          <SearchableSelect
            name="orgId"
            value={params.orgId}
            placeholder="Select an organization..."
            options={orgs.map((org) => ({
              value: org.id,
              label: `${org.name} (${org._count.members} members)`,
            }))}
            className="w-80"
          />
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Select
          </button>
        </form>

        {selectedOrg && (
          <>
            <h3 className="mb-2 text-lg font-medium">{selectedOrg.name}</h3>
            <div className="mb-4 text-sm text-muted-foreground">
              <span>Members: {selectedOrg._count.members}</span>
              <span className="ml-4">
                Current:{' '}
                {formatAllowedConnectors(
                  selectedOrg.settings?.allowedConnectors,
                )}
              </span>
            </div>
            <OrgConnectorsForm
              orgId={selectedOrg.id}
              current={selectedOrg.settings?.allowedConnectors ?? []}
              appDefaults={defaults}
            />
          </>
        )}

        {!selectedOrg && params.orgId && (
          <p className="text-sm text-muted-foreground">
            Organization not found.
          </p>
        )}
      </div>

      {/* All orgs overview table */}
      <div>
        <h2 className="mb-4 text-xl font-semibold">
          All Organizations Connectors
        </h2>
        <div className="rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">
                  Organization
                </th>
                <th className="px-4 py-3 text-right font-medium">Members</th>
                <th className="px-4 py-3 text-left font-medium">
                  Allowed Connectors
                </th>
                <th className="w-10 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => (
                <tr
                  key={org.id}
                  className="border-b border-border last:border-0 transition-colors hover:bg-muted/50"
                >
                  <td className="px-4 py-3 font-medium">
                    <a
                      href={`/organizations/${org.id}`}
                      className="hover:underline"
                    >
                      {org.name}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {org._count.members}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatAllowedConnectors(org.settings?.allowedConnectors)}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`/connectors?orgId=${org.id}`}
                      className="text-xs text-primary hover:underline"
                    >
                      Edit
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
