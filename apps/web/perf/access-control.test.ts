/**
 * Access-control matrix, run against a real seeded database.
 *
 * This is not a unit test with a mocked Prisma client — those already exist in
 * `src/features/documents/services/queries/__tests__/` and they assert the
 * shape of the `where` clause. They cannot tell you whether that clause
 * actually excludes the rows it is supposed to. This does, by asking Postgres.
 *
 * Requires the load dataset:
 *   DATABASE_URL=...:55432/ragen_perf npx tsx perf/seed-load.ts
 *   DATABASE_URL=...:55432/ragen_perf npx vitest run -c vitest.perf.config.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import { getUserFilesQuery } from '../src/features/documents/services/queries/get-user-files-query';
import { getAllOrgFilesQuery } from '../src/features/documents/services/queries/get-all-org-files-query';
import { orgVisibilityScope } from '../src/lib/auth-access-control';

import {
  PRIMARY_ORG_ID,
  SECOND_ORG_ID,
  USERS,
  FILES,
  SECOND_ORG_FILE,
  NAMED_PRIMARY_USER_IDS,
} from './fixture.js';

const connectionString = process.env.DATABASE_URL!;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

/** Resolved the same way `auth-guards.ts` does it, against the real rows. */
async function actorFor(userId: string, orgId: string) {
  const [memberships, member] = await Promise.all([
    prisma.teamMember.findMany({
      where: { userId, team: { organizationId: orgId } },
      select: { teamId: true },
    }),
    prisma.member.findFirst({ where: { organizationId: orgId, userId } }),
  ]);
  return {
    userId,
    teamIds: memberships.map((m) => m.teamId),
    scope: orgVisibilityScope(member?.role),
    isMember: Boolean(member),
  };
}

type Actor = Awaited<ReturnType<typeof actorFor>>;
const actors: Record<string, Actor> = {};

beforeAll(async () => {
  for (const id of NAMED_PRIMARY_USER_IDS) {
    actors[id] = await actorFor(id, PRIMARY_ORG_ID);
  }
  actors[USERS.outsider.id] = await actorFor(USERS.outsider.id, SECOND_ORG_ID);

  const files = await prisma.userFile.count({
    where: { organizationId: PRIMARY_ORG_ID },
  });
  if (files === 0) {
    throw new Error('Load dataset missing — run perf/seed-load.ts first.');
  }
});

afterAll(() => prisma.$disconnect());

/** Ids visible to an actor through the knowledge-base listing. */
async function listedIds(actor: Actor, orgId = PRIMARY_ORG_ID) {
  const seen: string[] = [];
  // Walk every page: an access bug that only shows up past page 1 is still a
  // bug, and the fixture files are not guaranteed to land on the first page.
  for (let page = 1; ; page++) {
    const res = await getUserFilesQuery(orgId, actor.teamIds, {
      userId: actor.userId,
      scope: actor.scope,
      // `undefined` rather than null: the page passes null to browse the root,
      // which would hide anything filed in a folder and mask a leak.
      folderId: undefined,
      viewMode: 'all',
      page,
      pageSize: 200,
    });
    seen.push(...res.items.map((f) => f.id));
    if (page >= res.totalPages) {
      return seen;
    }
  }
}

describe('knowledge-base listing honours per-file access', () => {
  for (const [key, file] of Object.entries(FILES)) {
    const allowed = new Set<string>(file.expected);

    it(`${key}: visible to exactly the granted users`, async () => {
      const visibleTo: string[] = [];
      for (const userId of NAMED_PRIMARY_USER_IDS) {
        const ids = await listedIds(actors[userId]!);
        if (ids.includes(file.id)) {
          visibleTo.push(userId);
        }
      }
      expect({ file: key, visibleTo: visibleTo.sort() }).toEqual({
        file: key,
        visibleTo: [...allowed].sort(),
      });
    });
  }

  it('the same folder grant does surface under "shared with me"', async () => {
    const actor = actors[USERS.bob.id]!;
    const res = await getUserFilesQuery(PRIMARY_ORG_ID, actor.teamIds, {
      userId: actor.userId,
      scope: actor.scope,
      folderId: undefined,
      viewMode: 'shared-with-me',
      pageSize: 200,
    });
    expect(res.items.map((f) => f.id)).toContain(
      FILES.aliceInFolderSharedToBob.id,
    );
  });
});

describe('assistant file picker honours per-file access', () => {
  it('never offers a non-admin a file they were not granted', async () => {
    const leaks: { user: string; file: string }[] = [];
    for (const userId of NAMED_PRIMARY_USER_IDS) {
      const actor = actors[userId]!;
      const offered = await getAllOrgFilesQuery(PRIMARY_ORG_ID, actor.teamIds, {
        userId: actor.userId,
        scope: actor.scope,
      });
      const offeredIds = new Set(offered.map((f) => f.id));
      for (const [key, file] of Object.entries(FILES)) {
        if (
          offeredIds.has(file.id) &&
          !(file.expected as readonly string[]).includes(userId)
        ) {
          leaks.push({ user: userId, file: key });
        }
      }
    }
    expect(leaks).toEqual([]);
  });
});

describe('cross-organization isolation', () => {
  it("the second org's file never appears for a primary-org user", async () => {
    for (const userId of NAMED_PRIMARY_USER_IDS) {
      const ids = await listedIds(actors[userId]!);
      expect(ids).not.toContain(SECOND_ORG_FILE.id);
    }
  });

  it('a non-member listing the primary org leaks no owned file', async () => {
    // Resolved against the org being listed, not the one they belong to:
    // that makes `scope` 'member' and `teamIds` empty, which is what a
    // forged org id in a session would look like.
    const outsider = await actorFor(USERS.outsider.id, PRIMARY_ORG_ID);
    expect(outsider.isMember).toBe(false);
    const ids = await listedIds(outsider, PRIMARY_ORG_ID);
    const named = new Set<string>(Object.values(FILES).map((f) => f.id));
    const leaked = ids.filter((id) => named.has(id));
    // Unowned "legacy" files are treated as org-wide by design, so the
    // assertion that matters is that nothing *owned* comes back.
    expect(leaked).toEqual([FILES.legacyOrgWide.id]);
  });

  it('a primary-org user cannot list the second org', async () => {
    const ids = await listedIds(actors[USERS.alice.id]!, SECOND_ORG_ID);
    expect(ids).not.toContain(SECOND_ORG_FILE.id);
  });
});

describe('shared-with-me view', () => {
  async function sharedWithMe(actor: Actor) {
    const res = await getUserFilesQuery(PRIMARY_ORG_ID, actor.teamIds, {
      userId: actor.userId,
      scope: actor.scope,
      folderId: undefined,
      viewMode: 'shared-with-me',
      pageSize: 200,
    });
    return res.items.map((f) => f.id);
  }

  it("lists bob's direct and team grants", async () => {
    const ids = await sharedWithMe(actors[USERS.bob.id]!);
    expect(ids).toContain(FILES.aliceSharedToBobUser.id);
    expect(ids).toContain(FILES.aliceSharedToEngTeam.id);
  });

  it("does not list alice's or carol's unshared files for bob", async () => {
    const ids = await sharedWithMe(actors[USERS.bob.id]!);
    expect(ids).not.toContain(FILES.alicePrivate.id);
    expect(ids).not.toContain(FILES.carolPrivate.id);
  });

  it('shows dave nothing, since nothing was ever shared with him', async () => {
    const ids = await sharedWithMe(actors[USERS.dave.id]!);
    const named = new Set<string>(Object.values(FILES).map((f) => f.id));
    expect(ids.filter((id) => named.has(id))).toEqual([]);
  });
});
