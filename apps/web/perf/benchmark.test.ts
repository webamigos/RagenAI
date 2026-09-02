/**
 * Query-level performance measurement against the load dataset.
 *
 * Reports latency for the queries that back the pages a user hits most, and
 * fails only on thresholds generous enough to catch a genuine regression (a
 * dropped index, an N+1) rather than machine noise. Numbers are printed either
 * way — the report is the point, the assertions are a floor.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import { getUserFilesQuery } from '../src/features/documents/services/queries/get-user-files-query';
import { getAllOrgFilesQuery } from '../src/features/documents/services/queries/get-all-org-files-query';
import { PRIMARY_ORG_ID, USERS } from './fixture.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

type Stat = {
  label: string;
  p50: number;
  p95: number;
  max: number;
  runs: number;
};
const results: Stat[] = [];

/** Median and p95 over `runs` iterations, after a warm-up that is discarded. */
async function measure(
  label: string,
  fn: () => Promise<unknown>,
  runs = 20,
): Promise<Stat> {
  await fn();
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    await fn();
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  const stat = {
    label,
    p50: times[Math.floor(runs * 0.5)]!,
    p95: times[Math.floor(runs * 0.95)]!,
    max: times[runs - 1]!,
    runs,
  };
  results.push(stat);
  return stat;
}

let aliceTeams: string[];

beforeAll(async () => {
  const memberships = await prisma.teamMember.findMany({
    where: { userId: USERS.alice.id, team: { organizationId: PRIMARY_ORG_ID } },
    select: { teamId: true },
  });
  aliceTeams = memberships.map((m) => m.teamId);

  const files = await prisma.userFile.count();
  const messages = await prisma.message.count();
  console.log(`\nDataset: ${files} files, ${messages} messages\n`);
});

afterAll(async () => {
  const pad = (s: string, n: number) => s.padEnd(n);
  console.log('\n' + pad('query', 52) + 'p50      p95      max');
  console.log('-'.repeat(78));
  for (const r of results) {
    console.log(
      pad(r.label, 52) +
        pad(`${r.p50.toFixed(1)}ms`, 9) +
        pad(`${r.p95.toFixed(1)}ms`, 9) +
        `${r.max.toFixed(1)}ms`,
    );
  }
  console.log('');
  await prisma.$disconnect();
});

describe('knowledge-base listing', () => {
  it('admin view, first page', async () => {
    const s = await measure('KB list — org admin, page 1', () =>
      getUserFilesQuery(PRIMARY_ORG_ID, [], {
        userId: USERS.owner.id,
        isOrgAdmin: true,
        folderId: null,
        pageSize: 25,
      }),
    );
    expect(s.p95).toBeLessThan(500);
  });

  it('member view, first page — the wide access OR', async () => {
    const s = await measure('KB list — member (access OR), page 1', () =>
      getUserFilesQuery(PRIMARY_ORG_ID, aliceTeams, {
        userId: USERS.alice.id,
        isOrgAdmin: false,
        folderId: null,
        pageSize: 25,
      }),
    );
    expect(s.p95).toBeLessThan(500);
  });

  it('member view, deep page', async () => {
    const s = await measure('KB list — member, page 5', () =>
      getUserFilesQuery(PRIMARY_ORG_ID, aliceTeams, {
        userId: USERS.alice.id,
        isOrgAdmin: false,
        folderId: undefined,
        page: 5,
        pageSize: 25,
      }),
    );
    expect(s.p95).toBeLessThan(500);
  });

  it('shared-with-me view — four correlated subqueries', async () => {
    const s = await measure('KB list — shared-with-me', () =>
      getUserFilesQuery(PRIMARY_ORG_ID, aliceTeams, {
        userId: USERS.bob.id,
        isOrgAdmin: false,
        folderId: undefined,
        viewMode: 'shared-with-me',
        pageSize: 25,
      }),
    );
    expect(s.p95).toBeLessThan(500);
  });

  it('sorted by file size with type filter', async () => {
    const s = await measure('KB list — sort+filter', () =>
      getUserFilesQuery(PRIMARY_ORG_ID, aliceTeams, {
        userId: USERS.alice.id,
        isOrgAdmin: false,
        folderId: undefined,
        sort: 'fileSize',
        dir: 'desc',
        fileType: ['PDF', 'DOCX'],
        pageSize: 25,
      }),
    );
    expect(s.p95).toBeLessThan(500);
  });
});

describe('assistant file picker', () => {
  it('loads every completed file in the org, unpaginated', async () => {
    const s = await measure('file picker — all org files (no paging)', () =>
      getAllOrgFilesQuery(PRIMARY_ORG_ID, aliceTeams, {
        userId: USERS.alice.id,
        isOrgAdmin: false,
      }),
    );
    expect(s.p95).toBeLessThan(1000);
  });
});

describe('threads and messages', () => {
  it('thread list for an org', async () => {
    const s = await measure('thread list — 50 newest', () =>
      prisma.thread.findMany({
        where: { organizationId: PRIMARY_ORG_ID },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    );
    expect(s.p95).toBeLessThan(300);
  });

  it('thread with its messages', async () => {
    const thread = await prisma.thread.findFirst({
      where: { organizationId: PRIMARY_ORG_ID },
      select: { id: true },
    });
    const s = await measure('thread detail — messages included', () =>
      prisma.thread.findFirst({
        where: { id: thread!.id, organizationId: PRIMARY_ORG_ID },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      }),
    );
    expect(s.p95).toBeLessThan(300);
  });
});

/**
 * Below this many rows Postgres is *right* to sequentially scan `user_files` —
 * reading a small table beats descending an index — so a plan assertion there
 * would fail on correct behaviour. Only a dataset big enough for the choice to
 * matter can say anything about index coverage.
 */
const PLAN_ASSERTION_MIN_ROWS = 5_000;

describe('index coverage', () => {
  /**
   * A sequential scan on the access filter is the regression that would hurt
   * most as a tenant grows, and it stays invisible in latency long after it
   * starts mattering. Asserted on the plan rather than the clock.
   */
  it('the access-filtered listing does not sequentially scan user_files', async () => {
    const rows = await prisma.userFile.count();
    if (rows < PLAN_ASSERTION_MIN_ROWS) {
      console.log(
        `\nSkipping the plan assertion: ${rows} rows in user_files, which is ` +
          `below ${PLAN_ASSERTION_MIN_ROWS}. A seq scan is the correct plan at ` +
          `this size. Re-seed with PERF_FILES_PER_ORG=5000 to exercise it.\n`,
      );
      return;
    }

    const plan = await prisma.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(
      `EXPLAIN (ANALYZE, FORMAT TEXT)
       SELECT * FROM user_files
       WHERE organization_id = $1
         AND (owner_id IS NULL OR owner_id = $2)
       ORDER BY created_at DESC LIMIT 25`,
      PRIMARY_ORG_ID,
      USERS.alice.id,
    );
    const text = plan.map((r) => r['QUERY PLAN']).join('\n');
    console.log('\nEXPLAIN — access-filtered listing:\n' + text + '\n');
    expect(text).toMatch(/Index|Bitmap/i);
  });
});
