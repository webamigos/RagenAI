import { prisma } from '@/lib/db';
import { SearchableSelect } from '@/app/components/SearchableSelect';
import { DefaultModelsForm } from './DefaultModelsForm';
import { OrgModelsForm } from './OrgModelsForm';
import { getDefaultAllowedModelsAction } from './actions';
import { allModels } from './models-config';

export const dynamic = 'force-dynamic';

interface SearchParams {
  orgId?: string;
}

async function getOrgsWithModels() {
  return prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      settings: {
        select: {
          allowedModels: true,
        },
      },
      _count: { select: { members: true } },
    },
    orderBy: { name: 'asc' },
  });
}

function formatAllowedModels(allowedModels: string[] | undefined): string {
  if (!allowedModels || allowedModels.length === 0) {
    return 'All models';
  }
  const labels = allowedModels.map((value) => {
    const model = allModels.find((m) => m.value === value);
    return model?.label ?? value;
  });
  if (labels.length <= 3) {
    return labels.join(', ');
  }
  return `${labels.slice(0, 3).join(', ')} +${labels.length - 3} more`;
}

export default async function ModelsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const [orgs, defaults] = await Promise.all([
    getOrgsWithModels(),
    getDefaultAllowedModelsAction(),
  ]);

  const selectedOrg = params.orgId
    ? orgs.find((o) => o.id === params.orgId)
    : null;

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Models Management</h1>

      {/* Default Allowed Models */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-xl font-semibold">
          Default Allowed Models (for new organizations)
        </h2>
        <DefaultModelsForm defaults={defaults} />
      </div>

      {/* Per-org Allowed Models */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-xl font-semibold">
          Organization Allowed Models
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
                {formatAllowedModels(selectedOrg.settings?.allowedModels)}
              </span>
            </div>
            <OrgModelsForm
              orgId={selectedOrg.id}
              current={selectedOrg.settings?.allowedModels ?? []}
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
        <h2 className="mb-4 text-xl font-semibold">All Organizations Models</h2>
        <div className="rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">
                  Organization
                </th>
                <th className="px-4 py-3 text-right font-medium">Members</th>
                <th className="px-4 py-3 text-left font-medium">
                  Allowed Models
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
                    {formatAllowedModels(org.settings?.allowedModels)}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`/models?orgId=${org.id}`}
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
