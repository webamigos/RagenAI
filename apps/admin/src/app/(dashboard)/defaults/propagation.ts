import 'server-only';

/**
 * What changing a platform default does — and does not do — to organizations
 * that already exist.
 *
 * ## Five defaults, three behaviours
 *
 * Reading the code rather than the names turns up a table that decides this
 * whole feature. `applyDefaultLimitsToOrg` copies all five into the
 * organization's own settings row, but only three of them are ever *read*
 * from there:
 *
 * | Default | Read live at request time | Copied into the org row |
 * |---|---|---|
 * | `default_allowed_connectors` | **yes** — `getAvailableConnectorsForOrg` | yes |
 * | `default_allowed_templates`  | **yes** — `getAvailableTemplates`       | yes |
 * | `default_allowed_models`     | no — only `getAllowedModels(orgId)`    | yes |
 * | `default_organization_limits` | no — the org row is authoritative     | yes |
 * | `default_rag_pipeline_settings` | no — falls back to a **hardcoded** constant | yes |
 *
 * The first two need no propagation: they already apply to every organization
 * whose own list is empty. Worse than unnecessary, propagating them is
 * **harmful** — writing the default into an organization's list turns "this
 * organization inherits the platform default" into "this organization is
 * pinned to the default as it was that day", so the next change never reaches
 * it. That is an existing defect in `applyDefaultLimitsToOrg`, which runs at
 * signup: organizations created *after* a connector was added inherit
 * correctly, and organizations created *before* it are pinned. The panel does
 * not repeat it, and the page says why.
 *
 * The last three are the ones worth a button: today the configured default
 * reaches only organizations created after it was set. The RAG row is the
 * sharpest case — `getRagPipelineSettings` falls back to
 * `defaultRagPipelineSettings`, the constant in the source, not to the value
 * an administrator configured. So an organization with no RAG settings row
 * ignores the platform default entirely.
 *
 * ## Why the preview is not optional
 *
 * The apply is **additive**, matching `applyDefaultLimitsToOrg`: a default of
 * `null` means "no limit", and there is no way to tell that apart from "leave
 * this alone". So propagation can raise or lower a ceiling but never remove
 * one, and an administrator who has just set a limit back to unlimited would
 * otherwise press a button that silently does nothing for that field.
 *
 * The preview therefore reports two lists per organization: what will change,
 * and what the default leaves unset and so will be skipped. The second list is
 * the one that was impossible to know before.
 */

export type PropagationGroup = 'limits' | 'models' | 'rag';

export const PROPAGATION_GROUPS: readonly PropagationGroup[] = [
  'limits',
  'models',
  'rag',
];

export function isPropagationGroup(value: unknown): value is PropagationGroup {
  return (
    typeof value === 'string' &&
    PROPAGATION_GROUPS.includes(value as PropagationGroup)
  );
}

/** One field that would move, rendered as a before/after pair. */
export type FieldChange = {
  field: string;
  before: string;
  after: string;
};

export type OrgPreview = {
  organizationId: string;
  organizationName: string;
  changes: FieldChange[];
  /** Fields the default leaves unset, so propagation cannot touch them. */
  skipped: string[];
};

/**
 * The defaults, already resolved, in the shape the diff needs. Kept as plain
 * data so the diff is pure and testable without a database.
 */
export type ResolvedDefaults = {
  limits: {
    storageLimitBytes: number | null;
    projectStorageLimitBytes: number | null;
    singleFileLimitBytes: number | null;
    monthlyTokenLimit: number | null;
    monthlyCostLimitCents: number | null;
    monthlyMessageLimit: number | null;
    monthlyApiRequestLimit: number | null;
    maxMembers: number | null;
  };
  allowedModels: string[];
  /**
   * `null` when `default_rag_pipeline_settings` has never been saved.
   *
   * Not defaulted to the constants in apps/web's source, for two reasons.
   * Copying them here would be a fourth hand-maintained duplicate of a list
   * this repository has architecture tests to prevent; and propagating them
   * would switch RAG features on or off across every organization on the
   * platform because a row was missing, which no administrator asked for.
   */
  rag: {
    multiQueryEnabled: boolean;
    docSummariesEnabled: boolean;
    contentModerationEnabled: boolean;
    rerankingEnabled: boolean;
  } | null;
};

/** An organization's current values, as read from `OrganizationSettings`. */
export type OrgCurrent = {
  organizationId: string;
  organizationName: string;
  storageLimitBytes: bigint | null;
  projectStorageLimitBytes: bigint | null;
  singleFileLimitBytes: bigint | null;
  monthlyTokenLimit: bigint | null;
  monthlyCostLimitCents: number | null;
  monthlyMessageLimit: number | null;
  monthlyApiRequestLimit: number | null;
  maxMembers: number | null;
  allowedModels: string[];
  multiQueryEnabled: boolean | null;
  docSummariesEnabled: boolean | null;
  contentModerationEnabled: boolean | null;
  rerankingEnabled: boolean | null;
};

const LIMIT_FIELDS = [
  'storageLimitBytes',
  'projectStorageLimitBytes',
  'singleFileLimitBytes',
  'monthlyTokenLimit',
  'monthlyCostLimitCents',
  'monthlyMessageLimit',
  'monthlyApiRequestLimit',
  'maxMembers',
] as const;

const RAG_FIELDS = [
  'multiQueryEnabled',
  'docSummariesEnabled',
  'contentModerationEnabled',
  'rerankingEnabled',
] as const;

/** `BigInt` and `number` are compared as strings so 5n equals 5. */
function sameNumber(
  current: bigint | number | null,
  next: number | null,
): boolean {
  if (current === null || next === null) {
    return current === null && next === null;
  }
  return String(current) === String(next);
}

function showNumber(value: bigint | number | null): string {
  return value === null ? 'unset' : String(value);
}

function showList(value: string[]): string {
  return value.length === 0 ? 'no restriction' : value.join(', ');
}

/**
 * The change an organization would see. Pure: no database, no clock.
 *
 * Returns `changes: []` for an organization already matching the default,
 * which the caller uses to leave it out of the apply entirely rather than
 * writing a row that changes nothing.
 */
export function previewOrg(
  group: PropagationGroup,
  defaults: ResolvedDefaults,
  current: OrgCurrent,
): OrgPreview {
  const changes: FieldChange[] = [];
  const skipped: string[] = [];

  if (group === 'limits') {
    for (const field of LIMIT_FIELDS) {
      const next = defaults.limits[field];
      if (next === null) {
        // Additive, exactly like `applyDefaultLimitsToOrg`: a null default is
        // indistinguishable from "leave alone", so it cannot clear a limit.
        skipped.push(field);
        continue;
      }
      if (!sameNumber(current[field], next)) {
        changes.push({
          field,
          before: showNumber(current[field]),
          after: String(next),
        });
      }
    }
  }

  if (group === 'models') {
    if (defaults.allowedModels.length === 0) {
      // Same reasoning: an empty default means "no restriction", which cannot
      // be told apart from "do not touch this organization's list".
      skipped.push('allowedModels');
    } else {
      const before = [...current.allowedModels].sort().join(',');
      const after = [...defaults.allowedModels].sort().join(',');
      if (before !== after) {
        changes.push({
          field: 'allowedModels',
          before: showList(current.allowedModels),
          after: showList(defaults.allowedModels),
        });
      }
    }
  }

  if (group === 'rag') {
    if (defaults.rag === null) {
      // Nothing configured, so nothing to propagate. Skipping is the whole
      // answer here: there is no value to write that anybody chose.
      skipped.push(...RAG_FIELDS);
    } else {
      // The only non-additive group. Every configured value is a definite
      // boolean, so there is nothing ambiguous to skip — and an organization
      // with a null column is currently on the hardcoded constant in
      // apps/web rather than the configured default, which is exactly what
      // needs correcting.
      for (const field of RAG_FIELDS) {
        const next = defaults.rag[field];
        if (current[field] !== next) {
          changes.push({
            field,
            before: current[field] === null ? 'unset' : String(current[field]),
            after: String(next),
          });
        }
      }
    }
  }

  return {
    organizationId: current.organizationId,
    organizationName: current.organizationName,
    changes,
    skipped,
  };
}

/** The write for one organization, or `null` when nothing would move. */
export function buildUpdate(
  group: PropagationGroup,
  defaults: ResolvedDefaults,
  preview: OrgPreview,
): Record<string, unknown> | null {
  if (preview.changes.length === 0) {
    return null;
  }

  const data: Record<string, unknown> = {};
  const changed = new Set(preview.changes.map((change) => change.field));

  if (group === 'limits') {
    for (const field of LIMIT_FIELDS) {
      const next = defaults.limits[field];
      if (next === null || !changed.has(field)) {
        continue;
      }
      // The three byte columns are `BigInt` in the schema; the rest are `Int`.
      data[field] =
        field === 'storageLimitBytes' ||
        field === 'projectStorageLimitBytes' ||
        field === 'singleFileLimitBytes' ||
        field === 'monthlyTokenLimit'
          ? BigInt(next)
          : next;
    }
  }

  if (group === 'models' && changed.has('allowedModels')) {
    data.allowedModels = defaults.allowedModels;
  }

  if (group === 'rag' && defaults.rag !== null) {
    for (const field of RAG_FIELDS) {
      if (changed.has(field)) {
        data[field] = defaults.rag[field];
      }
    }
  }

  return Object.keys(data).length > 0 ? data : null;
}
