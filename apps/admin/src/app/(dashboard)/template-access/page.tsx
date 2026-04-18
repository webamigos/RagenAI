import { prisma } from '@/lib/db';
import { SearchableSelect } from '@/app/components/SearchableSelect';
import { DefaultTemplatesForm } from './DefaultTemplatesForm';
import { OrgTemplatesForm } from './OrgTemplatesForm';
import {
  getActiveTemplatesAction,
  getDefaultAllowedTemplatesAction,
} from './actions';

export const dynamic = 'force-dynamic';

interface SearchParams {
  orgId?: string;
}

async function getOrgsWithTemplates() {
  return prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      settings: {
        select: {
          allowedTemplates: true,
        },
      },
      _count: { select: { members: true } },
    },
    orderBy: { name: 'asc' },
  });
}

export default async function TemplateAccessPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const [orgs, templates, defaults] = await Promise.all([
    getOrgsWithTemplates(),
    getActiveTemplatesAction(),
    getDefaultAllowedTemplatesAction(),
  ]);

  const selectedOrg = params.orgId
    ? orgs.find((o) => o.id === params.orgId)
    : null;

  function formatAllowed(allowed: string[] | undefined): string {
    if (!allowed || allowed.length === 0) {
      return 'All (inherited)';
    }
    const labels = allowed.map((id) => {
      const tmpl = templates.find((t) => t.id === id);
      return tmpl?.name ?? id.slice(0, 8);
    });
    if (labels.length <= 3) {
      return labels.join(', ');
    }
    return `${labels.slice(0, 3).join(', ')} +${labels.length - 3} more`;
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Assistants Access Management</h1>

      {/* Default Allowed Assistants */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-xl font-semibold">
          Default Allowed Assistants (for new organizations)
        </h2>
        <DefaultTemplatesForm templates={templates} defaults={defaults} />
      </div>

      {/* Per-org Allowed Assistants */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-xl font-semibold">
          Organization Allowed Assistants
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
                Current: {formatAllowed(selectedOrg.settings?.allowedTemplates)}
              </span>
            </div>
            <OrgTemplatesForm
              orgId={selectedOrg.id}
              templates={templates}
              current={selectedOrg.settings?.allowedTemplates ?? []}
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
          All Organizations Assistants
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
                  Allowed Assistants
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
                    {formatAllowed(org.settings?.allowedTemplates)}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`/template-access?orgId=${org.id}`}
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
