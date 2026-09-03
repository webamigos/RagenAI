import { MODEL_REGISTRY } from '@ragenai/platform-contracts';

import { prisma } from '@/lib/db';
import {
  budgetHasDrifted,
  findOfferableButUnserved,
  findStrandedOrgs,
} from './analysis';
import {
  getLiteLLMHealth,
  getLiteLLMModelInfo,
  getLiteLLMTeamInfo,
} from '@/lib/litellm';

export const dynamic = 'force-dynamic';

/**
 * What the proxy knows, as opposed to what this panel believes.
 *
 * Every other page here reads the application database. This one reads LiteLLM,
 * because the two can disagree and the disagreement is invisible from either
 * side: the panel writes model allowlists and budgets into the proxy and
 * discarded the response for as long as it existed.
 *
 * Everything degrades. A proxy that is down makes this page say so rather than
 * fail, since "the proxy is unreachable" is the single most useful thing it can
 * tell an operator.
 */

type OrgBudget = {
  id: string;
  name: string;
  /** What the panel stored, in cents. */
  configuredCents: number | null;
  /** What the proxy reports for the org-level team, in dollars. */
  proxyMaxBudget: number | null;
  proxySpend: number | null;
  /** Null when the proxy has no team for this organization at all. */
  known: boolean;
};

async function getProxyState() {
  /**
   * Reachability comes from the health call itself, not from a second probe.
   *
   * This used to also call `isLiteLLMAvailable()`, which hits the same
   * `/health` — so the page fired two concurrent requests at an endpoint that
   * pings every model deployment behind it. Under that contention both blew
   * their timeouts and the page reported an outage while the proxy was
   * answering `curl` in 1.5 seconds. One call, and `null` already means
   * "could not read it".
   */
  const [health, modelInfo] = await Promise.all([
    getLiteLLMHealth(),
    getLiteLLMModelInfo(),
  ]);
  const reachable = health !== null || modelInfo.length > 0;

  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      settings: {
        select: { monthlyCostLimitCents: true, allowedModels: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  // One /team/info per organization. Fine at this scale — the panel already
  // lists every organization on several pages — and the alternative,
  // /team/list, has no wrapper yet (ADR-34).
  const budgets: OrgBudget[] = reachable
    ? await Promise.all(
        orgs.map(async (org) => {
          const info = await getLiteLLMTeamInfo(org.id).catch(() => null);
          return {
            id: org.id,
            name: org.name,
            configuredCents: org.settings?.monthlyCostLimitCents ?? null,
            proxyMaxBudget: info?.max_budget ?? null,
            proxySpend: info?.spend ?? null,
            known: info !== null,
          };
        }),
      )
    : [];

  const served = modelInfo.map((m) => m.model_name);
  const offerableButUnserved = findOfferableButUnserved(served);
  const strandedOrgs = findStrandedOrgs(
    orgs.map((org) => ({
      id: org.id,
      name: org.name,
      allowedModels: org.settings?.allowedModels ?? [],
    })),
    served,
  );

  return {
    reachable,
    health,
    modelInfo,
    budgets,
    offerableButUnserved,
    strandedOrgs,
    checkedAt: new Date(),
  };
}

function Card({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'good' | 'bad';
}) {
  const valueClass = tone === 'bad' ? 'text-destructive' : 'text-foreground';
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}

function money(dollars: number | null): string {
  return dollars == null ? '—' : `$${dollars.toFixed(2)}`;
}

/**
 * A proxy configured with a `master_key` answers `/health` with 401 rather than
 * refusing the connection, so "did not respond" is the wrong thing to tell an
 * operator when the credential is simply missing here.
 */
function unreachableHeadline(): string {
  if (!process.env.LITELLM_PROXY_URL) {
    return 'No proxy is configured.';
  }
  if (!process.env.LITELLM_MASTER_KEY) {
    return 'The proxy did not answer, and no master key is set.';
  }
  return 'The LiteLLM proxy did not respond.';
}

/** A model the registry has never heard of is shown, with an inferred label. */
function shownToUsers(entry: { visible: boolean } | undefined): string {
  if (!entry) {
    return 'Yes';
  }
  return entry.visible ? 'Yes' : 'Internal';
}

/**
 * LiteLLM puts the provider's whole Python traceback in `error`. Rendered raw
 * it is several hundred lines in one table cell and pushes the page sideways,
 * while the part an operator needs — the exception and its message — is the
 * first line. The rest goes in the title attribute rather than being thrown
 * away.
 */
function firstErrorLine(error: string): string {
  const [first = ''] = error.split(/\r?\n/);
  const trimmed = first.trim();
  return trimmed.length > 240 ? `${trimmed.slice(0, 240)}…` : trimmed;
}

function proxyBudgetLabel(org: OrgBudget): string {
  if (!org.known) {
    return 'no team';
  }
  if (org.proxyMaxBudget == null) {
    return '∞';
  }
  return money(org.proxyMaxBudget);
}

export default async function ProxyPage() {
  const {
    reachable,
    health,
    modelInfo,
    budgets,
    offerableButUnserved,
    strandedOrgs,
    checkedAt,
  } = await getProxyState();

  if (!reachable) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Proxy</h1>
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6">
          <p className="font-medium text-destructive">
            {unreachableHeadline()}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {!process.env.LITELLM_MASTER_KEY &&
            process.env.LITELLM_PROXY_URL ? (
              <>
                A proxy with{' '}
                <code className="font-mono text-xs">master_key</code> set
                answers <code className="font-mono text-xs">/health</code> with
                a 401 rather than refusing the connection, so this is more
                likely a missing credential here than an outage there.
              </>
            ) : (
              <>
                Model restrictions and budgets saved from this panel are stored
                in the database either way, and the app enforces cost limits
                itself — but nothing written here is reaching the proxy.
              </>
            )}
          </p>
          <dl className="mt-4 space-y-1 font-mono text-xs text-muted-foreground">
            <div>
              LITELLM_PROXY_URL —{' '}
              {process.env.LITELLM_PROXY_URL ? 'set' : 'not set'}
            </div>
            <div>
              LITELLM_MASTER_KEY —{' '}
              {process.env.LITELLM_MASTER_KEY ? 'set' : 'not set'}
            </div>
          </dl>
        </div>
      </div>
    );
  }

  const unhealthy = health?.unhealthy_endpoints ?? [];
  const healthy = health?.healthy_endpoints ?? [];
  /**
   * `/health` makes the proxy ping every deployment behind it, which on a cold
   * proxy exceeds the timeout. When it does, the counts must read "unknown" —
   * rendering `0` and `0` says there are no deployments, which is the opposite
   * of what a page listing eight served models has just shown.
   */
  const healthKnown = health !== null;

  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-bold">Proxy</h1>
        <p className="text-sm text-muted-foreground">
          Checked {checkedAt.toLocaleTimeString()}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Models served" value={String(modelInfo.length)} />
        <Card
          label="Healthy deployments"
          value={healthKnown ? String(healthy.length) : '—'}
        />
        <Card
          label="Unhealthy deployments"
          value={healthKnown ? String(unhealthy.length) : '—'}
          tone={unhealthy.length > 0 ? 'bad' : 'good'}
        />
        <Card
          label="Organizations known to the proxy"
          value={`${budgets.filter((b) => b.known).length} / ${budgets.length}`}
        />
      </div>

      {/* The two disagreements worth acting on, surfaced before the raw data. */}
      {(offerableButUnserved.length > 0 || strandedOrgs.length > 0) && (
        <div className="space-y-4">
          {strandedOrgs.length > 0 && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6">
              <h2 className="font-semibold text-destructive">
                {strandedOrgs.length} organization
                {strandedOrgs.length === 1 ? '' : 's'} restricted to models this
                proxy does not serve
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Their model picker is empty — an allowlist that matches nothing
                does not narrow the list, it empties it. Clear the restriction
                on the Models page, or provision the model in{' '}
                <code className="font-mono text-xs">
                  infra/litellm/config.yaml
                </code>
                .
              </p>
              <ul className="mt-3 space-y-1 text-sm">
                {strandedOrgs.map((org) => (
                  <li key={org.id}>
                    <a
                      href={`/organizations/${org.id}`}
                      className="text-primary hover:underline"
                    >
                      {org.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {offerableButUnserved.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="font-semibold">
                Offerable in the panel, not served here
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                The Models page lists these because the shared registry marks
                them user-visible, but this deployment does not serve them.
                Allowing one restricts an organization to nothing.
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {offerableButUnserved.map((model) => (
                  <li
                    key={model.id}
                    className="rounded-md border border-border px-2 py-1 font-mono text-xs text-muted-foreground"
                  >
                    {model.id}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!healthKnown && (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Per-deployment health could not be read within the timeout —{' '}
          <code className="font-mono text-xs">/health</code> makes the proxy
          ping every backend, which a cold proxy does not finish in time. The
          model list below comes from{' '}
          <code className="font-mono text-xs">/model/info</code> and is
          unaffected.
        </p>
      )}

      {unhealthy.length > 0 && (
        <div>
          <h2 className="mb-4 text-xl font-semibold">Unhealthy deployments</h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Model</th>
                  <th className="px-4 py-3 text-left font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {unhealthy.map((endpoint, i) => (
                  <tr
                    key={`${endpoint.model ?? 'unknown'}-${i}`}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-3 font-mono text-xs">
                      {endpoint.model ??
                        endpoint.litellm_model_name ??
                        'unknown'}
                    </td>
                    <td className="max-w-xl px-4 py-3 text-destructive">
                      {endpoint.error ? (
                        <span title={endpoint.error} className="break-words">
                          {firstErrorLine(endpoint.error)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-4 text-xl font-semibold">
          Models this deployment serves
        </h2>
        <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
          Read from the proxy, not from the registry. The upstream column is the
          only place the real backend appears — <code>/v1/models</code> returns
          just an id, so grouping elsewhere is inferred from the name.
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Model ID</th>
                <th className="px-4 py-3 text-left font-medium">Upstream</th>
                <th className="px-4 py-3 text-left font-medium">
                  Shown to users
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  In the registry
                </th>
              </tr>
            </thead>
            <tbody>
              {modelInfo.map((model) => {
                const entry = MODEL_REGISTRY[model.model_name];
                return (
                  <tr
                    key={model.model_name}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-3 font-mono text-xs">
                      {model.model_name}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {model.litellm_params?.model ?? '—'}
                    </td>
                    <td className="px-4 py-3">{shownToUsers(entry)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {entry ? (
                        entry.displayName
                      ) : (
                        <span className="text-destructive">
                          Unknown — label is inferred
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {modelInfo.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    The proxy returned no models. Without a master key{' '}
                    <code className="font-mono text-xs">/model/info</code> is
                    unavailable.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-xl font-semibold">Spend against budget</h2>
        <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
          The proxy&apos;s own numbers for each organization&apos;s team. A
          budget that differs from the configured limit means a save did not
          reach the proxy.
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">
                  Organization
                </th>
                <th className="px-4 py-3 text-left font-medium">Configured</th>
                <th className="px-4 py-3 text-left font-medium">
                  Proxy budget
                </th>
                <th className="px-4 py-3 text-left font-medium">Spend</th>
              </tr>
            </thead>
            <tbody>
              {budgets.map((org) => {
                const configured =
                  org.configuredCents != null
                    ? org.configuredCents / 100
                    : null;
                const drifted =
                  org.known &&
                  budgetHasDrifted(org.configuredCents, org.proxyMaxBudget);
                return (
                  <tr
                    key={org.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-3">
                      <a
                        href={`/organizations/${org.id}`}
                        className="text-primary hover:underline"
                      >
                        {org.name}
                      </a>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {configured == null ? '∞' : money(configured)}
                    </td>
                    <td
                      className={`px-4 py-3 tabular-nums ${
                        drifted ? 'text-destructive' : ''
                      }`}
                    >
                      {proxyBudgetLabel(org)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {money(org.proxySpend)}
                    </td>
                  </tr>
                );
              })}
              {budgets.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No organizations.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
