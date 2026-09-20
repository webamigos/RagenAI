/**
 * What each rule actually did, over the last week.
 *
 * The page authors rules; this is the only thing on it that reports what they
 * cost. A rule is created switched off because its false-positive rate has not
 * been measured — and `LOG` mode exists so it can be. Neither means anything
 * without somewhere to read the result, which is what this is: the number an
 * operator promotes a rule to `BLOCK` on the strength of.
 *
 * Counts come from `security_events`, which both runtimes already write
 * through one mapping in `packages/guardrails` — so a hit arriving through the
 * public API is counted the same as one from the panel, and neither surface
 * has its own tally to drift.
 */

import {
  BLOCKED_HIT_EVENT,
  GUARDRAIL_SECURITY_EVENT_TYPES,
} from '@ragenai/guardrails/contracts';

import { requireAdmin } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';

import {
  HIT_WINDOW_DAYS,
  type GuardrailHitCounts,
  type GuardrailHitsByRule,
} from './hit-window';

/**
 * One query per rule, rather than one grouped query for all of them.
 *
 * The natural statement here groups by `metadata->>'guardrail'`, which Prisma
 * cannot express and raw SQL can. It is not written that way on purpose:
 * `security_events` is a tenant-scoped table, and
 * `tests/architecture/raw-sql-carries-its-org-filter.test.ts` requires every
 * raw statement touching one to name an org column — the tenant-scope
 * extension cannot see inside a `$queryRaw`, so that guard is the only thing
 * standing there. This page is deliberately platform-wide, so the statement
 * could not satisfy it, and the way to land it would have been to put a hole
 * in a security guard for a count on an admin page.
 *
 * A JSON-path filter per rule stays inside Prisma, where the guard's premise
 * holds. The cost is one query per rule on the list instead of one for the
 * page; they run concurrently, the list is the platform's own rules rather
 * than every organization's, and each is a count over a single index range.
 */
export async function getGuardrailHitCounts(
  rulePublicIds: readonly string[],
): Promise<GuardrailHitsByRule> {
  await requireAdmin();

  if (rulePublicIds.length === 0) {
    return {};
  }

  const since = new Date();
  since.setDate(since.getDate() - HIT_WINDOW_DAYS);

  const counted = await Promise.all(
    rulePublicIds.map(async (publicId) => {
      const grouped = await prisma.securityEvent.groupBy({
        by: ['eventType'],
        where: {
          eventType: { in: [...GUARDRAIL_SECURITY_EVENT_TYPES] },
          createdAt: { gte: since },
          // The rule's id, which is what both recorders write. Its *name* is in
          // there too and is not used: a name is editable, so counting on it
          // would split one rule's history in half the day somebody renames it.
          metadata: { path: ['guardrail'], equals: publicId },
        },
        _count: { _all: true },
      });

      const counts: GuardrailHitCounts = {
        blocked: total(grouped, BLOCKED_HIT_EVENT),
        flagged: total(grouped, ...others()),
      };

      return [publicId, counts] as const;
    }),
  );

  return Object.fromEntries(counted);
}

type GroupedCount = {
  eventType: string;
  _count: { _all: number };
};

/**
 * Everything that is not a block.
 *
 * Derived from the shared list rather than named, so a third guardrail event
 * type — an output stage refusing, a judge timing out — is counted from the
 * day it exists instead of silently falling out of both columns.
 */
function others(): string[] {
  return GUARDRAIL_SECURITY_EVENT_TYPES.filter(
    (type) => type !== BLOCKED_HIT_EVENT,
  );
}

function total(rows: GroupedCount[], ...eventTypes: string[]): number {
  return rows
    .filter((row) => eventTypes.includes(row.eventType))
    .reduce((sum, row) => sum + row._count._all, 0);
}
