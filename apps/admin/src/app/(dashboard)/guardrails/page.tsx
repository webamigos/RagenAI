import { SearchableSelect } from '@/app/components/SearchableSelect';
import { prisma } from '@/lib/db';

import { listPlatformGuardrailsAction } from './actions';
import { GuardrailsPage } from './components/GuardrailsPage';
import { OrgGuardrailsView } from './components/OrgGuardrailsView';
import { getOrgGuardrailsAction } from './org-actions';

export const dynamic = 'force-dynamic';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ orgId?: string }>;
}) {
  const params = await searchParams;

  const [rules, orgs] = await Promise.all([
    listPlatformGuardrailsAction(),
    prisma.organization.findMany({
      select: { id: true, name: true, _count: { select: { members: true } } },
      orderBy: { name: 'asc' },
    }),
  ]);

  const selected = params.orgId
    ? orgs.find((o) => o.id === params.orgId)
    : null;
  const orgView = selected ? await getOrgGuardrailsAction(selected.id) : null;

  return (
    <div className="space-y-8">
      <GuardrailsPage rules={rules} />

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-xl font-semibold">One organization</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          What this organization is actually subject to, and which layer decided
          each value. An override set here applies to that organization only.
        </p>

        <form className="my-6 flex gap-2">
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

        {selected && orgView ? (
          <>
            <h3 className="mb-3 text-lg font-medium">{selected.name}</h3>
            <OrgGuardrailsView organizationId={selected.id} data={orgView} />
          </>
        ) : null}
      </div>
    </div>
  );
}
