import { prisma } from '@/lib/db';
import { SearchableSelect } from '@/app/components/SearchableSelect';
import { OrgFeaturesForm } from './OrgFeaturesForm';
import { getOrgFeatureOverridesAction } from './actions';

export const dynamic = 'force-dynamic';

interface SearchParams {
  orgId?: string;
}

async function getOrgs() {
  return prisma.organization.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

export default async function FeaturesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const orgs = await getOrgs();
  const selectedOrg = params.orgId
    ? orgs.find((o) => o.id === params.orgId)
    : null;

  const currentOverrides = selectedOrg
    ? await getOrgFeatureOverridesAction(selectedOrg.id)
    : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Feature Overrides</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Override plan-level feature flags for a specific organization. Use
          this for partners, custom deals, or one-off feature grants. Plan
          features are managed in{' '}
          <a className="underline" href="/features/plans">
            Subscription Plans
          </a>
          .
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-xl font-semibold">Pick organization</h2>
        <form className="flex gap-2">
          <SearchableSelect
            name="orgId"
            value={params.orgId}
            placeholder="Select an organization..."
            options={orgs.map((o) => ({ value: o.id, label: o.name }))}
            className="max-w-md"
          />
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Load
          </button>
        </form>
      </div>

      {selectedOrg && currentOverrides && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-1 text-xl font-semibold">{selectedOrg.name}</h2>
          <p className="mb-4 text-xs text-muted-foreground font-mono">
            {selectedOrg.id}
          </p>
          <OrgFeaturesForm orgId={selectedOrg.id} current={currentOverrides} />
        </div>
      )}
    </div>
  );
}
