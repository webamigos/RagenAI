import { prisma } from '@/lib/db';
import { SearchableSelect } from '@/app/components/SearchableSelect';
import { DefaultRagSettingsForm } from './DefaultRagSettingsForm';
import { OrgRagSettingsForm } from './OrgRagSettingsForm';
import { getDefaultRagSettingsAction } from './actions';

export const dynamic = 'force-dynamic';

interface SearchParams {
  orgId?: string;
}

async function getOrgsWithRagSettings() {
  return prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      settings: {
        select: {
          multiQueryEnabled: true,
          docSummariesEnabled: true,
          contentModerationEnabled: true,
          rerankingEnabled: true,
        },
      },
      _count: { select: { members: true } },
    },
    orderBy: { name: 'asc' },
  });
}

function formatToggle(value: boolean | null, defaultValue: boolean): string {
  const effective = value ?? defaultValue;
  return effective ? 'ON' : 'OFF';
}

export default async function RagSettingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const [orgs, defaults] = await Promise.all([
    getOrgsWithRagSettings(),
    getDefaultRagSettingsAction(),
  ]);

  const selectedOrg = params.orgId
    ? orgs.find((o) => o.id === params.orgId)
    : null;

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">RAG Settings</h1>

      {/* Default RAG Settings */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-xl font-semibold">
          Default RAG Settings (for new organizations)
        </h2>
        <DefaultRagSettingsForm defaults={defaults} />
      </div>

      {/* Per-org RAG Settings */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-xl font-semibold">
          Organization RAG Settings
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
            </div>
            <OrgRagSettingsForm
              orgId={selectedOrg.id}
              current={{
                multiQueryEnabled:
                  selectedOrg.settings?.multiQueryEnabled ??
                  defaults.multiQueryEnabled,
                docSummariesEnabled:
                  selectedOrg.settings?.docSummariesEnabled ??
                  defaults.docSummariesEnabled,
                contentModerationEnabled:
                  selectedOrg.settings?.contentModerationEnabled ??
                  defaults.contentModerationEnabled,
                rerankingEnabled:
                  selectedOrg.settings?.rerankingEnabled ??
                  defaults.rerankingEnabled,
              }}
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
          All Organizations RAG Settings
        </h2>
        <div className="rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">
                  Organization
                </th>
                <th className="px-4 py-3 text-right font-medium">Members</th>
                <th className="px-4 py-3 text-center font-medium">
                  Multi-query
                </th>
                <th className="px-4 py-3 text-center font-medium">Summaries</th>
                <th className="px-4 py-3 text-center font-medium">
                  Moderation
                </th>
                <th className="px-4 py-3 text-center font-medium">Reranking</th>
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
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {formatToggle(
                      org.settings?.multiQueryEnabled ?? null,
                      defaults.multiQueryEnabled,
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {formatToggle(
                      org.settings?.docSummariesEnabled ?? null,
                      defaults.docSummariesEnabled,
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {formatToggle(
                      org.settings?.contentModerationEnabled ?? null,
                      defaults.contentModerationEnabled,
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {formatToggle(
                      org.settings?.rerankingEnabled ?? null,
                      defaults.rerankingEnabled,
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`/rag-settings?orgId=${org.id}`}
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
