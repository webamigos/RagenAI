import type {
  KnowledgePageStatus,
  KnowledgePageType,
} from '@ragenai/brain-contracts';

import { QuoteIndex } from '../extraction/verify-quotes';
import { addIsoDuration } from './duration';

/**
 * The finding types computed from a page's own fields (spec C2). The other two
 * are raised by something that happened — `CONTRADICTION` by a model judging
 * two pages, `EXTRACTION_FAILED` by a failed extraction — and are never
 * created or resolved by the rules in this file.
 */
export const COMPUTED_FINDING_TYPES = [
  'GAP',
  'ORPHAN',
  'STALE',
  'UNOWNED',
] as const;
export type ComputedFindingType = (typeof COMPUTED_FINDING_TYPES)[number];

export type FindingSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * Curated knowledge: what a person approved. Candidates are the review
 * queue's to judge — every candidate is unowned and most are unlinked by
 * construction, so running these rules over them would bury the four findings
 * that matter under hundreds that say "this has not been reviewed yet".
 */
export const CURATED_PAGE_STATUSES = [
  'APPROVED',
  'STALE',
] as const satisfies readonly KnowledgePageStatus[];

export type SnapshotPage = {
  id: number;
  type: KnowledgePageType;
  status: KnowledgePageStatus;
  ownerId: string | null;
  verifyEvery: string | null;
  lastVerifiedAt: Date | null;
  /** The latest `APPROVE` decision's time; null if none is recorded. */
  approvedAt: Date | null;
  /** Serving in the index — raises the severity of what is wrong with it. */
  publishedAt: Date | null;
};

export type SnapshotSource = {
  id: number;
  pageId: number;
  fileId: string;
  documentVersionId: string;
  quote: string;
  sourceDeletedAt: Date | null;
};

/**
 * A source file as it is now. `activeText` is needed only when the active
 * version differs from one a source is pinned to, and the loader is expected
 * to read it only then — reading every document's full text to learn that
 * nothing moved would make this the most expensive query in the feature.
 */
export type SnapshotFile = {
  activeVersionId: string | null;
  activeText: string | null;
};

export type FindingsSnapshot = {
  /** Every page of the organization that is not `REJECTED`. */
  pages: ReadonlyArray<SnapshotPage>;
  edges: ReadonlyArray<{ fromPageId: number; toPageId: number }>;
  sources: ReadonlyArray<SnapshotSource>;
  /** Keyed by file id. A file absent from the map no longer exists. */
  files: ReadonlyMap<string, SnapshotFile>;
  /** User ids that are members of the organization now. */
  members: ReadonlySet<string>;
};

export type StaleReason =
  | { kind: 'source_deleted'; sourceId: number; fileId: string }
  | {
      kind: 'quote_gone';
      sourceId: number;
      fileId: string;
      pinnedVersionId: string;
      activeVersionId: string;
    }
  | { kind: 'verification_due'; dueAt: string };

export type FindingDetail =
  | { rule: 'process_without_role'; fingerprint: string }
  | { rule: 'no_links'; fingerprint: string }
  | { rule: 'no_owner'; fingerprint: string }
  | { rule: 'owner_left'; ownerId: string; fingerprint: string }
  | { rule: 'stale'; reasons: StaleReason[]; fingerprint: string };

/** A finding the rules say should be open now. */
export type DesiredFinding = {
  type: ComputedFindingType;
  /** Always one page for these four types, as the database's CHECK requires. */
  pageIds: [number];
  fileId: string | null;
  severity: FindingSeverity;
  detail: FindingDetail;
};

/**
 * The four computed findings for the curated pages in a snapshot.
 *
 * The rules, each stated once:
 *
 * - **UNOWNED** — no owner, or an owner who is no longer a member of the
 *   organization. The second is the case the product exists for ("whose
 *   author has left"): `ownerId` is still set, so a null check alone would
 *   report the page as owned by someone who cannot vouch for anything here.
 * - **STALE** — any of: a source whose file is gone (`sourceDeletedAt`, or no
 *   file row at all — the column's writer is Phase E's and must not be waited
 *   on); a source whose document's active version moved past the pinned one
 *   **and** whose cited words no longer occur in the new text; or a
 *   `verifyEvery` interval that has elapsed since the last verification (or,
 *   never verified, since approval). A version that moved on while still
 *   containing the quote is not stale: re-ingesting the same PDF mints a new
 *   version with the same text, and flagging each one would teach people to
 *   dismiss the finding. A file with no active version at all is not checked
 *   rather than guessed at.
 * - **ORPHAN** — no edge to or from any other page that is not rejected.
 * - **GAP** — a `PROCESS` page with no edge to any `ROLE` page: a process
 *   nobody is named as performing or owning. One rule, deliberately: it is
 *   the completeness check the data can support today, and a heuristic that
 *   fires on everything is worse than none.
 *
 * One finding per page per type. A page stale for three reasons has one
 * `STALE` finding listing all three, so the inbox shows it once.
 *
 * `fingerprint` is what the reasons amount to, independent of order; it is
 * how `reconcileFindings` tells "the same problem, still there" (a dismissal
 * stands) from "a different problem on the same page" (it is raised again).
 */
export function detectPageFindings(
  snapshot: FindingsSnapshot,
  now: Date,
): DesiredFinding[] {
  const curated = snapshot.pages.filter((p) =>
    (CURATED_PAGE_STATUSES as readonly string[]).includes(p.status),
  );
  const live = new Map(snapshot.pages.map((p) => [p.id, p]));
  const neighbours = new Map<number, Set<number>>();
  for (const edge of snapshot.edges) {
    if (
      edge.fromPageId === edge.toPageId ||
      !live.has(edge.fromPageId) ||
      !live.has(edge.toPageId)
    ) {
      continue;
    }
    link(neighbours, edge.fromPageId, edge.toPageId);
    link(neighbours, edge.toPageId, edge.fromPageId);
  }
  const sourcesByPage = new Map<number, SnapshotSource[]>();
  for (const source of snapshot.sources) {
    const list = sourcesByPage.get(source.pageId) ?? [];
    list.push(source);
    sourcesByPage.set(source.pageId, list);
  }
  const indexes = new Map<string, QuoteIndex>();
  const indexFor = (fileId: string, text: string) => {
    let index = indexes.get(fileId);
    if (!index) {
      index = new QuoteIndex(text);
      indexes.set(fileId, index);
    }
    return index;
  };

  const findings: DesiredFinding[] = [];
  for (const page of curated) {
    const published = page.publishedAt !== null;

    if (page.ownerId === null) {
      findings.push(
        one('UNOWNED', page, published ? 'HIGH' : 'MEDIUM', null, {
          rule: 'no_owner',
          fingerprint: 'no_owner',
        }),
      );
    } else if (!snapshot.members.has(page.ownerId)) {
      findings.push(
        one('UNOWNED', page, published ? 'HIGH' : 'MEDIUM', null, {
          rule: 'owner_left',
          ownerId: page.ownerId,
          fingerprint: `owner_left:${page.ownerId}`,
        }),
      );
    }

    const reasons: StaleReason[] = [];
    for (const source of sourcesByPage.get(page.id) ?? []) {
      const file = snapshot.files.get(source.fileId);
      if (source.sourceDeletedAt !== null || file === undefined) {
        reasons.push({
          kind: 'source_deleted',
          sourceId: source.id,
          fileId: source.fileId,
        });
        continue;
      }
      if (
        file.activeVersionId === null ||
        file.activeVersionId === source.documentVersionId
      ) {
        continue;
      }
      if (
        file.activeText !== null &&
        !indexFor(source.fileId, file.activeText).contains(source.quote)
      ) {
        reasons.push({
          kind: 'quote_gone',
          sourceId: source.id,
          fileId: source.fileId,
          pinnedVersionId: source.documentVersionId,
          activeVersionId: file.activeVersionId,
        });
      }
    }
    const due = verificationDue(page);
    if (due !== null && due.getTime() <= now.getTime()) {
      reasons.push({ kind: 'verification_due', dueAt: due.toISOString() });
    }
    if (reasons.length > 0) {
      const sourceFiles = new Set(
        reasons.flatMap((r) => ('fileId' in r ? [r.fileId] : [])),
      );
      const aboutSources = reasons.some((r) => r.kind !== 'verification_due');
      findings.push(
        one(
          'STALE',
          page,
          aboutSources && published ? 'HIGH' : 'MEDIUM',
          sourceFiles.size === 1 ? [...sourceFiles][0] : null,
          {
            rule: 'stale',
            reasons,
            fingerprint: reasons
              .map((r) =>
                r.kind === 'verification_due'
                  ? `${r.kind}:${r.dueAt}`
                  : `${r.kind}:${r.sourceId}`,
              )
              .sort()
              .join('|'),
          },
        ),
      );
    }

    const around = neighbours.get(page.id);
    if (!around || around.size === 0) {
      findings.push(
        one('ORPHAN', page, 'LOW', null, {
          rule: 'no_links',
          fingerprint: 'no_links',
        }),
      );
    }
    if (
      page.type === 'PROCESS' &&
      ![...(around ?? [])].some((id) => live.get(id)?.type === 'ROLE')
    ) {
      findings.push(
        one('GAP', page, 'LOW', null, {
          rule: 'process_without_role',
          fingerprint: 'process_without_role',
        }),
      );
    }
  }
  return findings;
}

/** When the page's `verifyEvery` interval comes due, or null if it never does. */
export function verificationDue(
  page: Pick<SnapshotPage, 'verifyEvery' | 'lastVerifiedAt' | 'approvedAt'>,
): Date | null {
  if (page.verifyEvery === null) {
    return null;
  }
  const since = page.lastVerifiedAt ?? page.approvedAt;
  if (since === null) {
    return null;
  }
  return addIsoDuration(since, page.verifyEvery);
}

function one(
  type: ComputedFindingType,
  page: SnapshotPage,
  severity: FindingSeverity,
  fileId: string | null,
  detail: FindingDetail,
): DesiredFinding {
  return { type, pageIds: [page.id], fileId, severity, detail };
}

function link(map: Map<number, Set<number>>, from: number, to: number) {
  const set = map.get(from) ?? new Set<number>();
  set.add(to);
  map.set(from, set);
}
