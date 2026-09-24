import {
  COMPUTED_FINDING_TYPES,
  type ComputedFindingType,
  type DesiredFinding,
} from './page-findings';

export type FindingStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED';

/** A finding row as stored, reduced to what reconciliation reads. */
export type ExistingFinding = {
  id: number;
  type: string;
  status: FindingStatus;
  pageIds: ReadonlyArray<number>;
  detail: unknown;
};

export type FindingsPlan = {
  create: DesiredFinding[];
  /** Open rows whose problem is still there but reads differently now. */
  update: { id: number; finding: DesiredFinding }[];
  /** Open rows whose condition no longer holds — or a duplicate of another. */
  resolve: number[];
};

/**
 * What to write so the stored findings match what the rules say now.
 *
 * The computed findings are a *view* over the pages' fields (spec C2), but
 * the inbox reads rows — so this turns the view into a diff, and three
 * statuses have three meanings it has to respect:
 *
 * - **OPEN** rows are the rules' to manage. One whose condition still holds
 *   stays (updated if its detail changed, so the id a person may be looking
 *   at survives); one whose condition is gone is resolved. That includes a
 *   page that was rejected or deleted — its findings resolve rather than
 *   linger naming a page nobody curates.
 * - **DISMISSED** is a person's decision and outranks the rules: the same
 *   problem is not raised again. "The same" is the fingerprint, not the
 *   type — a page dismissed as stale because of one deleted source is raised
 *   again when a second source goes, because that is a problem nobody saw.
 * - **RESOLVED** is history. A condition that recurs opens a new row.
 *
 * Only the four computed types are touched. `CONTRADICTION` and
 * `EXTRACTION_FAILED` rows are passed over whatever their state, because
 * nothing here can tell whether their condition still holds.
 */
export function reconcileFindings(
  desired: ReadonlyArray<DesiredFinding>,
  existing: ReadonlyArray<ExistingFinding>,
): FindingsPlan {
  const plan: FindingsPlan = { create: [], update: [], resolve: [] };
  const want = new Map<string, DesiredFinding>();
  for (const finding of desired) {
    want.set(keyOf(finding.type, finding.pageIds[0]), finding);
  }

  const open = new Map<string, ExistingFinding>();
  const dismissed = new Map<string, Set<string>>();
  for (const row of existing) {
    if (!isComputed(row.type) || row.pageIds.length !== 1) {
      continue;
    }
    const key = keyOf(row.type, row.pageIds[0]);
    if (row.status === 'DISMISSED') {
      const set = dismissed.get(key) ?? new Set<string>();
      set.add(fingerprintOf(row.detail));
      dismissed.set(key, set);
    } else if (row.status === 'OPEN') {
      if (open.has(key)) {
        // Two open rows for one problem — a race, or an older bug. The inbox
        // should show it once; keep the lower id, which a person saw first.
        const kept = open.get(key)!;
        const [keep, drop] = kept.id < row.id ? [kept, row] : [row, kept];
        open.set(key, keep);
        plan.resolve.push(drop.id);
      } else {
        open.set(key, row);
      }
    }
  }

  for (const [key, row] of open) {
    const finding = want.get(key);
    if (!finding) {
      plan.resolve.push(row.id);
    } else if (fingerprintOf(row.detail) !== finding.detail.fingerprint) {
      plan.update.push({ id: row.id, finding });
    }
  }
  for (const [key, finding] of want) {
    if (open.has(key)) {
      continue;
    }
    if (dismissed.get(key)?.has(finding.detail.fingerprint)) {
      continue;
    }
    plan.create.push(finding);
  }
  plan.resolve.sort((a, b) => a - b);
  return plan;
}

function keyOf(type: string, pageId: number): string {
  return `${type}:${pageId}`;
}

function isComputed(type: string): type is ComputedFindingType {
  return (COMPUTED_FINDING_TYPES as readonly string[]).includes(type);
}

function fingerprintOf(detail: unknown): string {
  if (
    detail !== null &&
    typeof detail === 'object' &&
    'fingerprint' in detail &&
    typeof detail.fingerprint === 'string'
  ) {
    return detail.fingerprint;
  }
  // A row written without one matches nothing, so it is rewritten (if open)
  // or, if dismissed, does not suppress a finding it cannot be compared to.
  return '';
}
