/**
 * Direct-object-reference probe against a running app.
 *
 * The listing queries filter correctly — `access-control.test.ts` proves that
 * against real rows. This suite asks the different question: what happens when
 * a user skips the listing and requests a document id outright. Those two
 * answers are not the same today, which is the whole reason this file exists.
 *
 * Needs the app running against the load dataset:
 *   DATABASE_URL=...:55432/ragen_perf npx next dev -p 3100
 *   PERF_BASE_URL=http://localhost:3100 npx vitest run -c vitest.perf.config.ts
 *
 * Skips itself when PERF_BASE_URL is unset, so it never breaks a run that only
 * wanted the DB-level suites.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import {
  PASSWORD,
  USERS,
  FILES,
  DOCUMENTS,
  SECOND_ORG_FILE,
} from './fixture.js';

const BASE = process.env.PERF_BASE_URL;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/** Session cookie per user, obtained through the real sign-in endpoint. */
const cookies: Record<string, string> = {};

/**
 * Signs in through the real endpoint, retrying on 429.
 *
 * Better Auth rate-limits sign-in, and it is enabled in a production build —
 * four accounts in a row is already enough to trip it. That is the behaviour we
 * want in production, so the test backs off rather than the app relaxing.
 */
async function signIn(email: string) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
      method: 'POST',
      // Origin is required, not optional: Better Auth rejects a credential
      // sign-in that arrives without one (MISSING_OR_NULL_ORIGIN, 403), and
      // `fetch` does not set it the way a browser would.
      headers: { 'Content-Type': 'application/json', Origin: BASE! },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after')) || 2 ** attempt;
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }
    if (!res.ok) {
      throw new Error(
        `sign-in failed for ${email}: ${res.status} ${await res.text()}`,
      );
    }
    const setCookie = res.headers.getSetCookie?.() ?? [];
    return setCookie.map((c) => c.split(';')[0]).join('; ');
  }
  throw new Error(`sign-in for ${email} kept returning 429`);
}

async function as(user: string, path: string, init?: RequestInit) {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), cookie: cookies[user]! },
    redirect: 'manual',
  });
}

describe.skipIf(!BASE)('direct access by document id', () => {
  let versionId: string;

  beforeAll(async () => {
    for (const key of ['alice', 'bob', 'dave', 'outsider'] as const) {
      cookies[key] = await signIn(USERS[key].email);
    }
    const v = await prisma.documentVersion.findFirst({
      where: { documentId: DOCUMENTS.alicePrivate.id },
      orderBy: { versionNumber: 'asc' },
      select: { id: true },
    });
    versionId = v!.id;
  }, 60_000);

  it('lets the owner download their own file', async () => {
    const res = await as('alice', `/api/files/${FILES.alicePrivate.id}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('ALICE-PRIVATE-CONTENT-MARKER');
  });

  it('rejects an unauthenticated download', async () => {
    const res = await fetch(`${BASE}/api/files/${FILES.alicePrivate.id}`, {
      redirect: 'manual',
    });
    expect(res.status).toBe(401);
  });

  it('rejects a download from another organization', async () => {
    const res = await as('alice', `/api/files/${SECOND_ORG_FILE.id}`);
    expect(res.status).toBe(404);
  });

  it('rejects a foreign-org member reading into this org', async () => {
    const res = await as('outsider', `/api/files/${FILES.alicePrivate.id}`);
    expect(res.status).toBe(404);
  });

  /**
   * CONFIRMED DEFECT — within-organization IDOR on every by-id document route.
   *
   * `/api/files/[fileId]`, its `/thumbnail` sibling, and the document-version
   * routes all resolve the row with `where: { id, organizationId }` and stop
   * there. Ownership and `DocumentPermission` are never consulted, so any
   * authenticated member of the org can read any file in it by guessing or
   * harvesting an id — including files the knowledge-base listing correctly
   * hides from them. `getFileDetailsByIdQuery`, `getDocumentByIdQuery` and
   * `getDocumentPreviewQuery` share the shape.
   *
   * Marked `.fails()`: each starts passing the moment the route learns to check
   * permissions, which is the signal to unwrap it.
   */
  describe('within-org isolation', () => {
    it.fails('a non-owner with no grant cannot download the file', async () => {
      const res = await as('dave', `/api/files/${FILES.alicePrivate.id}`);
      expect(res.status).toBe(404);
    });

    it.fails(
      'a non-owner with no grant cannot read the thumbnail',
      async () => {
        const res = await as(
          'dave',
          `/api/files/${FILES.alicePrivate.id}/thumbnail`,
        );
        expect(res.status).toBe(404);
      },
    );

    it.fails('a non-owner with no grant cannot list versions', async () => {
      const res = await as(
        'dave',
        `/api/documents/${DOCUMENTS.alicePrivate.id}/versions`,
      );
      expect(res.status).toBe(404);
    });

    it.fails(
      'a non-owner with no grant cannot read version content',
      async () => {
        const res = await as(
          'dave',
          `/api/documents/${DOCUMENTS.alicePrivate.id}/versions/${versionId}`,
        );
        expect(res.status).toBe(404);
      },
    );

    /**
     * The same gap on a *write* path, which is the worse half: a rollback
     * rewrites the active version and re-indexes it, so an unauthorized member
     * can change what the assistant answers from, not merely read it.
     */
    it.fails(
      'a non-owner with no grant cannot roll back a version',
      async () => {
        const res = await as(
          'dave',
          `/api/documents/${DOCUMENTS.alicePrivate.id}/versions/${versionId}/rollback`,
          { method: 'POST' },
        );
        expect(res.status).toBe(404);
      },
    );
  });

  describe('grants do let the intended user through', () => {
    it('bob can download the file shared with him directly', async () => {
      const res = await as(
        'bob',
        `/api/files/${FILES.aliceSharedToBobUser.id}`,
      );
      expect(res.status).toBe(200);
    });

    it('bob can download the file shared with his team', async () => {
      const res = await as(
        'bob',
        `/api/files/${FILES.aliceSharedToEngTeam.id}`,
      );
      expect(res.status).toBe(200);
    });
  });
});
