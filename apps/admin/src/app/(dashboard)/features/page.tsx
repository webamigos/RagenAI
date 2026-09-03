import Link from 'next/link';

import { prisma } from '@/lib/db';
import { SearchableSelect } from '@/app/components/SearchableSelect';
import { OrgFeaturesForm } from './OrgFeaturesForm';
import { PlatformFeaturesForm } from './PlatformFeaturesForm';
import {
  getOrgFeatureOverridesAction,
  getOrgFeatureResolutionAction,
  getPlatformFeatureDefaultsAction,
} from './actions';
import {
  FEATURE_KEYS,
  FEATURE_LABELS,
  FEATURE_SOURCE_LABELS,
} from './feature-keys';

export const dynamic = 'force-dynamic';

/**
 * Feature flags, at both levels ADR-35 defines.
 *
 * The page used to offer per-organization overrides only, which left two gaps.
 * An operator managing no plans — the self-hosted case — could answer "is API
 * access on here" only by overriding each organization one at a time. And
 * having set an override, they could not see what a feature *evaluated* to, so
 * an override doing real work looked identical to one shadowed by a plan.
 */

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
  const [orgs, platformDefaults] = await Promise.all([
    getOrgs(),
    getPlatformFeatureDefaultsAction(),
  ]);

  const selectedOrg = params.orgId
    ? orgs.find((org) => org.id === params.orgId)
    : null;

  const [currentOverrides, resolution] = selectedOrg
    ? await Promise.all([
        getOrgFeatureOverridesAction(selectedOrg.id),
        getOrgFeatureResolutionAction(selectedOrg.id),
      ])
    : [null, null];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Features</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A flag is answered by the first layer that sets it:{' '}
          <strong>organization override</strong> → <strong>plan</strong> →{' '}
          <strong>platform default</strong> → built-in default. Plan features
          are managed in{' '}
          <Link className="underline" href="/features/plans">
            Subscription Plans
          </Link>
          .
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-xl font-semibold">Platform defaults</h2>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">
          What this installation does for every organization that has no
          override of its own. Set these once instead of repeating an override
          per organization — and note a plan still wins over them, so an
          installation that manages no plans is the case they were added for.
        </p>
        <PlatformFeaturesForm current={platformDefaults} />
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-xl font-semibold">Pick organization</h2>
        <form className="flex gap-2">
          <SearchableSelect
            name="orgId"
            value={params.orgId}
            placeholder="Select an organization..."
            options={orgs.map((org) => ({ value: org.id, label: org.name }))}
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

      {selectedOrg && resolution && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-1 text-xl font-semibold">
            {selectedOrg.name} — what it gets today
          </h2>
          <p className="mb-4 font-mono text-xs text-muted-foreground">
            {selectedOrg.id}
          </p>

          {/*
            The half the page was missing. An override that is being shadowed
            by a plan looked exactly like one doing its job.
          */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Feature</th>
                  <th className="px-4 py-3 text-left font-medium">Effective</th>
                  <th className="px-4 py-3 text-left font-medium">
                    Decided by
                  </th>
                </tr>
              </thead>
              <tbody>
                {FEATURE_KEYS.map((key) => (
                  <tr
                    key={key}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium">{FEATURE_LABELS[key]}</span>
                      <span className="block font-mono text-xs text-muted-foreground">
                        {key}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          resolution[key].value
                            ? 'bg-green-500/10 text-green-600'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {resolution[key].value ? 'on' : 'off'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {FEATURE_SOURCE_LABELS[resolution[key].source]}
                      {/*
                        The confusion this page exists to remove. A platform
                        default sits *below* the plan, so an operator who set
                        one and still sees the old value has no way to tell
                        that a plan is the reason — and in a self-hosted
                        install a vestigial seeded plan is exactly what does
                        it. Naming the conflict, and where to fix it, is the
                        difference between a control and a mystery.
                      */}
                      {resolution[key].source === 'plan' &&
                        typeof platformDefaults[key] === 'boolean' && (
                          <span className="mt-1 block text-xs text-destructive">
                            Your platform default (
                            {platformDefaults[key] ? 'on' : 'off'}) is not being
                            used — the plan sets this. Change it in{' '}
                            <Link href="/features/plans" className="underline">
                              Subscription Plans
                            </Link>{' '}
                            or override it for this organization below.
                          </span>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedOrg && currentOverrides && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold">
            Overrides for {selectedOrg.name}
          </h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">
            Highest priority — for partners, custom deals and one-off grants.
            Leave a row on &ldquo;Inherit&rdquo; to let the plan or the platform
            default decide.
          </p>
          <OrgFeaturesForm orgId={selectedOrg.id} current={currentOverrides} />
        </div>
      )}
    </div>
  );
}
