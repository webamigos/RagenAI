import Link from 'next/link';

import { getPropagationPreviewAction } from './actions';
import { ApplyPropagationButton } from './ApplyPropagationButton';
import {
  isPropagationGroup,
  PROPAGATION_GROUPS,
  type PropagationGroup,
} from './propagation';

export const dynamic = 'force-dynamic';

/**
 * Apply a changed platform default to organizations that already exist.
 *
 * `applyDefaultLimitsToOrg` runs once, at signup, and nothing ever re-applies
 * it. So every default an administrator has edited since — a storage ceiling,
 * an allowed-model list, the RAG pipeline switches — reached only the
 * organizations created afterwards. There was no way to see that, let alone
 * fix it, without `psql`.
 *
 * The preview is the point of the page rather than a safety wrapper around
 * it: propagation is additive, so what it will *not* do is as important as
 * what it will, and neither was knowable before.
 */

interface SearchParams {
  group?: string;
}

const GROUP_LABELS: Record<PropagationGroup, string> = {
  limits: 'Organization limits',
  models: 'Allowed models',
  rag: 'RAG pipeline settings',
};

const GROUP_SOURCES: Record<PropagationGroup, { label: string; href: string }> =
  {
    limits: { label: 'Limits', href: '/limits' },
    models: { label: 'Models', href: '/models' },
    rag: { label: 'RAG Settings', href: '/rag-settings' },
  };

export default async function DefaultsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const group: PropagationGroup = isPropagationGroup(params.group)
    ? params.group
    : 'limits';

  const preview = await getPropagationPreviewAction(group);
  const source = GROUP_SOURCES[group];
  const changed = preview.organizations.filter((org) => org.changes.length > 0);
  const unchanged = preview.organizations.length - changed.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Apply Defaults</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A default is copied into an organization when the organization is
          created, and never again. This page applies the current default to
          organizations that already exist — after showing exactly which ones
          would move, and to what.
        </p>
      </div>

      {/*
        Connectors and templates are deliberately absent, and saying so is
        part of the feature: an administrator who came here looking for them
        would otherwise conclude the page is incomplete.
      */}
      <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">
          Connectors and assistant templates are not here on purpose.
        </p>
        <p className="mt-1">
          Those two defaults are read on every request, so they already apply to
          every organization whose own list is empty — there is nothing to
          propagate. Writing the default into an organization&rsquo;s list would
          in fact <em>break</em> that: it turns &ldquo;inherits the platform
          default&rdquo; into &ldquo;pinned to the default as it was that
          day&rdquo;, and the next change would never reach it. Manage them from{' '}
          <Link href="/connectors" className="underline">
            Connectors
          </Link>{' '}
          and{' '}
          <Link href="/template-access" className="underline">
            Assistants Access
          </Link>
          .
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PROPAGATION_GROUPS.map((candidate) => (
          <Link
            key={candidate}
            href={`/defaults?group=${candidate}`}
            className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
              candidate === group
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input hover:bg-accent'
            }`}
          >
            {GROUP_LABELS[candidate]}
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold">{GROUP_LABELS[group]}</h2>
          <p className="text-sm text-muted-foreground">
            Edit the default itself in{' '}
            <Link href={source.href} className="underline">
              {source.label}
            </Link>
          </p>
        </div>

        {preview.configured ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {changed.length} of {preview.organizations.length} organizations
            would change; {unchanged} already match.
          </p>
        ) : (
          /*
            Zero changes because there is no default, which is not the same
            as zero changes because everything matches. Saying "2 already
            match" here read as reassurance about a default nobody had set.
          */
          <p className="mt-2 text-sm text-muted-foreground">
            No default has been saved for this group, so there is nothing to
            propagate. Set one in{' '}
            <Link href={source.href} className="underline">
              {source.label}
            </Link>{' '}
            first.
          </p>
        )}

        {preview.configured && preview.skippedFields.length > 0 && (
          /*
            The half nobody could see before. A default left unset cannot be
            told apart from "do not touch this", so these fields are skipped —
            and an administrator who has just set a limit back to unlimited
            needs to know the button will not clear it anywhere.
          */
          <div className="mt-4 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
            <p className="font-medium">
              Left alone, because the default does not set them:
            </p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {preview.skippedFields.join(', ')}
            </p>
            <p className="mt-2 text-muted-foreground">
              Propagation can change a value but never unset one: a default left
              blank is indistinguishable from &ldquo;leave this organization as
              it is&rdquo;. Removing a limit, or widening an allow-list back to
              everything, has to be done per organization.
            </p>
          </div>
        )}

        <div className="mt-6">
          <ApplyPropagationButton
            group={group}
            changedCount={preview.changedCount}
            configured={preview.configured}
          />
        </div>
      </div>

      {changed.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">
                  Organization
                </th>
                <th className="px-4 py-3 text-left font-medium">Field</th>
                <th className="px-4 py-3 text-left font-medium">Now</th>
                <th className="px-4 py-3 text-left font-medium">
                  After applying
                </th>
              </tr>
            </thead>
            <tbody>
              {changed.flatMap((org) =>
                org.changes.map((change, index) => (
                  <tr
                    key={`${org.organizationId}-${change.field}`}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-3">
                      {/* Named once per organization, not once per field. */}
                      {index === 0 ? (
                        <Link
                          href={`/organizations/${org.organizationId}`}
                          className="font-medium underline"
                        >
                          {org.organizationName}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">↳</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {change.field}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {change.before}
                    </td>
                    <td className="px-4 py-3 font-medium">{change.after}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
