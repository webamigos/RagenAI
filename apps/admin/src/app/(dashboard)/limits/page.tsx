import { prisma } from '@/lib/db';
import { SearchableSelect } from '@/app/components/SearchableSelect';
import prettyBytes from 'pretty-bytes';
import { DefaultLimitsForm } from './DefaultLimitsForm';
import { OrgLimitsForm } from './OrgLimitsForm';
import { getDefaultLimitsAction } from './actions';

export const dynamic = 'force-dynamic';

interface SearchParams {
  orgId?: string;
}

async function getOrgsWithLimits() {
  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      settings: {
        select: {
          storageLimitBytes: true,
          projectStorageLimitBytes: true,
          singleFileLimitBytes: true,
          monthlyTokenLimit: true,
          monthlyCostLimitCents: true,
          monthlyMessageLimit: true,
          maxMembers: true,
        },
      },
      _count: { select: { members: true } },
    },
    orderBy: { name: 'asc' },
  });

  return orgs;
}

export default async function LimitsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const [orgs, defaults] = await Promise.all([
    getOrgsWithLimits(),
    getDefaultLimitsAction(),
  ]);

  const selectedOrg = params.orgId
    ? orgs.find((o) => o.id === params.orgId)
    : null;

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Limits Management</h1>

      {/* Default Limits */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-xl font-semibold">
          Default Limits (for new organizations)
        </h2>
        <DefaultLimitsForm defaults={defaults} />
      </div>

      {/* Per-org Limits */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-xl font-semibold">Organization Limits</h2>
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
            <div className="mb-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span>Members: {selectedOrg._count.members}</span>
              {selectedOrg.settings && (
                <>
                  <span>
                    Storage limit:{' '}
                    {selectedOrg.settings.storageLimitBytes
                      ? prettyBytes(
                          Number(selectedOrg.settings.storageLimitBytes),
                        )
                      : 'unlimited'}
                  </span>
                  <span>
                    Max members:{' '}
                    {selectedOrg.settings.maxMembers ?? 'unlimited'}
                  </span>
                </>
              )}
            </div>
            <OrgLimitsForm
              orgId={selectedOrg.id}
              current={{
                storageLimitMb: selectedOrg.settings?.storageLimitBytes
                  ? Number(selectedOrg.settings.storageLimitBytes) /
                    (1024 * 1024)
                  : null,
                projectStorageLimitMb: selectedOrg.settings
                  ?.projectStorageLimitBytes
                  ? Number(selectedOrg.settings.projectStorageLimitBytes) /
                    (1024 * 1024)
                  : null,
                singleFileLimitMb: selectedOrg.settings?.singleFileLimitBytes
                  ? Number(selectedOrg.settings.singleFileLimitBytes) /
                    (1024 * 1024)
                  : null,
                monthlyTokenLimit: selectedOrg.settings?.monthlyTokenLimit
                  ? Number(selectedOrg.settings.monthlyTokenLimit)
                  : null,
                monthlyCostLimitCents:
                  selectedOrg.settings?.monthlyCostLimitCents ?? null,
                monthlyMessageLimit:
                  selectedOrg.settings?.monthlyMessageLimit ?? null,
                maxMembers: selectedOrg.settings?.maxMembers ?? null,
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
        <h2 className="mb-4 text-xl font-semibold">All Organizations Limits</h2>
        <div className="rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">
                  Organization
                </th>
                <th className="px-4 py-3 text-right font-medium">Members</th>
                <th className="px-4 py-3 text-right font-medium">
                  Max Members
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  Storage Limit
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  Project Limit
                </th>
                <th className="px-4 py-3 text-right font-medium">File Limit</th>
                <th className="px-4 py-3 text-right font-medium">
                  Token Limit
                </th>
                <th className="px-4 py-3 text-right font-medium">Cost Limit</th>
                <th className="px-4 py-3 text-right font-medium">
                  Message Limit
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
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {org.settings?.maxMembers ?? '∞'}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {org.settings?.storageLimitBytes
                      ? prettyBytes(Number(org.settings.storageLimitBytes))
                      : '∞'}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {org.settings?.projectStorageLimitBytes
                      ? prettyBytes(
                          Number(org.settings.projectStorageLimitBytes),
                        )
                      : '∞'}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {org.settings?.singleFileLimitBytes
                      ? prettyBytes(Number(org.settings.singleFileLimitBytes))
                      : '∞'}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {org.settings?.monthlyTokenLimit
                      ? Number(org.settings.monthlyTokenLimit).toLocaleString()
                      : '∞'}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {org.settings?.monthlyCostLimitCents
                      ? `$${(org.settings.monthlyCostLimitCents / 100).toFixed(2)}`
                      : '∞'}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {org.settings?.monthlyMessageLimit?.toLocaleString() ?? '∞'}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`/limits?orgId=${org.id}`}
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
