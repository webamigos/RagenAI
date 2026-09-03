/**
 * How usage numbers are joined and totalled, shared so the two surfaces
 * cannot disagree about them (ADR-35).
 *
 * `apps/web/.../organization/disk-usage` and `apps/admin/.../disk-usage` both
 * ran the same `userFile.groupBy(['organizationId'])`, built the same map,
 * joined it against the same organization rows and filled the same zeros — and
 * differed in three ways that mattered:
 *
 * - one asked for `_count: { id: true }` and read `_count.id`, the other
 *   `_count: true` and read `_count`, so the two produced the same number by
 *   different names;
 * - only one computed a usage percentage, so the other could not colour a bar
 *   without recomputing it;
 * - the field names disagreed (`totalBytes` versus `totalSize`), which is what
 *   makes copy-paste between them go wrong.
 *
 * ## Why this takes rows rather than a Prisma client
 *
 * Both apps use the *same* generated client, but it is generated into
 * `apps/web`, and a package cannot import from an app. Accepting a client
 * would mean a hand-written structural type over Prisma's delegates, which
 * costs the type safety this is supposed to protect.
 *
 * So the Prisma calls stay in each app — three lines each — and what lives
 * here is the part that actually drifted: the join, the zero-filling, the
 * arithmetic and the shapes. Fully typed, and testable without a database.
 *
 * The one thing this cannot enforce is *scoping*: it totals the rows it is
 * given. Passing an unscoped aggregate to answer a one-organization question
 * is a mistake at the call site, and it was a live one — the admin disk-usage
 * page aggregated every file on the platform even when a single organization
 * was selected, then filtered in JavaScript. `apps/admin`'s CSV export had
 * already been fixed for exactly that.
 */

/** An organization, as much of it as a usage join needs. */
export type UsageOrganization = {
  id: string;
  name: string;
  /** `null` means no ceiling. `bigint` because the column is `BigInt`. */
  storageLimitBytes: bigint | number | null;
};

/** One `userFile.groupBy` row, normalised by the caller. */
export type StorageAggregateRow = {
  /** `null` for files whose organization was deleted. */
  organizationId: string | null;
  totalBytes: number;
  fileCount: number;
  pageCount: number;
};

export type OrgStorageSummary = {
  orgId: string;
  orgName: string;
  totalBytes: number;
  fileCount: number;
  pageCount: number;
  storageLimitBytes: number | null;
  /** `null` when there is no ceiling to be a percentage of. */
  usagePercent: number | null;
};

export type StorageTotals = {
  totalBytes: number;
  fileCount: number;
  pageCount: number;
  /** Organizations at or over their ceiling. Zero when none has one. */
  overLimitCount: number;
};

const EMPTY_USAGE = { totalBytes: 0, fileCount: 0, pageCount: 0 };

/** `BigInt` and `number` both appear here; `Number` accepts either. */
function toNumberOrNull(value: bigint | number | null): number | null {
  return value === null ? null : Number(value);
}

/**
 * Join organizations to their aggregated file usage.
 *
 * Every organization is returned, including those with no files at all —
 * a missing aggregate row means zero, not absent, and an organization sitting
 * at zero is a fact worth showing rather than a row to drop.
 *
 * Sorted by bytes descending, because on both surfaces the question is "who is
 * using the most".
 */
export function joinOrgStorage(
  organizations: readonly UsageOrganization[],
  aggregates: readonly StorageAggregateRow[],
): OrgStorageSummary[] {
  const byOrg = new Map(
    aggregates
      .filter(
        (row): row is StorageAggregateRow & { organizationId: string } =>
          row.organizationId !== null,
      )
      .map((row) => [row.organizationId, row]),
  );

  return organizations
    .map((org) => {
      const usage = byOrg.get(org.id) ?? EMPTY_USAGE;
      const limit = toNumberOrNull(org.storageLimitBytes);
      return {
        orgId: org.id,
        orgName: org.name,
        totalBytes: usage.totalBytes,
        fileCount: usage.fileCount,
        pageCount: usage.pageCount,
        storageLimitBytes: limit,
        // A zero limit would be a division by zero *and* is not a meaningful
        // ceiling, so it is treated as no ceiling rather than as 0%.
        usagePercent:
          limit && limit > 0 ? (usage.totalBytes / limit) * 100 : null,
      };
    })
    .sort((a, b) => b.totalBytes - a.totalBytes);
}

/**
 * Totals across whatever was joined.
 *
 * Derived from the summaries rather than from the raw aggregates on purpose:
 * summing the aggregates would count files belonging to organizations that
 * were filtered out, which is how the admin page's totals disagreed with its
 * own table.
 */
export function sumStorage(
  summaries: readonly OrgStorageSummary[],
): StorageTotals {
  return summaries.reduce<StorageTotals>(
    (totals, summary) => ({
      totalBytes: totals.totalBytes + summary.totalBytes,
      fileCount: totals.fileCount + summary.fileCount,
      pageCount: totals.pageCount + summary.pageCount,
      overLimitCount:
        totals.overLimitCount +
        (summary.usagePercent !== null && summary.usagePercent >= 100 ? 1 : 0),
    }),
    { totalBytes: 0, fileCount: 0, pageCount: 0, overLimitCount: 0 },
  );
}

/** One `userFile.groupBy(['projectId'])` row, normalised by the caller. */
export type ProjectAggregateRow = {
  projectId: string | null;
  totalBytes: number;
  fileCount: number;
  pageCount: number;
};

export type ProjectStorageSummary = {
  projectId: string;
  projectTitle: string;
  totalBytes: number;
  fileCount: number;
  pageCount: number;
};

/**
 * The same join one level down: projects within one organization.
 *
 * No limit and no percentage — `OrganizationSettings` carries a
 * `projectStorageLimitBytes`, but it is a single ceiling applied to every
 * project rather than a per-project value, so attaching it to a row would
 * read as though each project had its own.
 */
export function joinProjectStorage(
  projects: readonly { id: string; title: string }[],
  aggregates: readonly ProjectAggregateRow[],
): ProjectStorageSummary[] {
  const byProject = new Map(
    aggregates
      .filter(
        (row): row is ProjectAggregateRow & { projectId: string } =>
          row.projectId !== null,
      )
      .map((row) => [row.projectId, row]),
  );

  return projects
    .map((project) => {
      const usage = byProject.get(project.id) ?? EMPTY_USAGE;
      return {
        projectId: project.id,
        projectTitle: project.title,
        totalBytes: usage.totalBytes,
        fileCount: usage.fileCount,
        pageCount: usage.pageCount,
      };
    })
    .sort((a, b) => b.totalBytes - a.totalBytes);
}

/**
 * The `_sum` selection every AI-usage aggregate must ask for.
 *
 * Shared because a surface that forgets one of these renders a blank cell
 * rather than an error — `_sum.inputTokens` is simply `undefined`, and the
 * null-coalescing below turns it into a confident zero.
 */
export const AI_USAGE_SUM_FIELDS = {
  inputTokens: true,
  outputTokens: true,
  totalTokens: true,
  estimatedCost: true,
} as const;

/** A `aiUsage.aggregate` result, as Prisma returns it. */
export type AiUsageAggregate = {
  _count: number;
  _sum: {
    inputTokens?: number | null;
    outputTokens?: number | null;
    totalTokens?: number | null;
    estimatedCost?: number | null;
  };
};

export type AiUsageTotals = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
};

/**
 * Null-coalesce an aggregate into definite numbers.
 *
 * Prisma returns `null` for every `_sum` when no row matched, which reaches a
 * template as "null" unless each one is defaulted — and each surface was
 * defaulting them separately, at four call sites apiece.
 */
export function toAiUsageTotals(
  aggregate: AiUsageAggregate | null | undefined,
): AiUsageTotals {
  return {
    requests: aggregate?._count ?? 0,
    inputTokens: aggregate?._sum?.inputTokens ?? 0,
    outputTokens: aggregate?._sum?.outputTokens ?? 0,
    totalTokens: aggregate?._sum?.totalTokens ?? 0,
    estimatedCost: aggregate?._sum?.estimatedCost ?? 0,
  };
}
