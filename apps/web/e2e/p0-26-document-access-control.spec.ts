import { test, expect, type APIRequestContext } from '@playwright/test';

import {
  AUTH_FILE,
  TEST_OTHER_USER_EMAIL,
  TEST_OTHER_USER_PASSWORD,
  TEST_PRIVATE_DOCUMENT_ID,
  TEST_PRIVATE_FILE_ID,
  TEST_PRIVATE_VERSION_ID,
} from './constants';

/**
 * Within-organization document isolation.
 *
 * Every by-id document route once resolved its row with
 * `where: { id, organizationId }` and stopped there, consulting neither
 * ownership nor `DocumentPermission`. Any authenticated member of the org
 * could therefore read — and through `rollback`, rewrite — any file in it by
 * id, including the ones the knowledge-base listing correctly hid from them.
 * Cross-org and unauthenticated access were already refused, so nothing about
 * the org filter could catch this.
 *
 * `p0-` on purpose: only `smoke-*` and `p0-*` run on a pull request, and a
 * regression here is a data leak, so it has to be able to block a merge.
 *
 * A 404 rather than a 403 is the expected answer throughout — telling an
 * unauthorized caller that the id is real is itself a disclosure.
 */

/** Signs the unprivileged seeded member in and returns their request context. */
async function asOtherUser(
  playwright: typeof import('@playwright/test').request,
  baseURL: string,
): Promise<APIRequestContext> {
  const context = await playwright.newContext({ baseURL });
  const res = await context.post('/api/auth/sign-in/email', {
    // Better Auth refuses a credential sign-in with no Origin
    // (MISSING_OR_NULL_ORIGIN), and an API request does not set one itself.
    headers: { Origin: baseURL },
    data: {
      email: TEST_OTHER_USER_EMAIL,
      password: TEST_OTHER_USER_PASSWORD,
    },
  });
  expect(
    res.status(),
    'the seeded second member should be able to sign in',
  ).toBe(200);
  return context;
}

test.describe('Document access control — within one organization', () => {
  test.describe('the owner still reaches their own document', () => {
    test.use({ storageState: AUTH_FILE });

    test('lists versions of their private document', async ({ request }) => {
      const res = await request.get(
        `/api/documents/${TEST_PRIVATE_DOCUMENT_ID}/versions`,
      );
      expect(res.status()).toBe(200);
      const { versions } = await res.json();
      expect(versions).toHaveLength(1);
      expect(versions[0]).toMatchObject({
        id: TEST_PRIVATE_VERSION_ID,
        isActive: true,
      });
    });

    test('reads the version content', async ({ request }) => {
      const res = await request.get(
        `/api/documents/${TEST_PRIVATE_DOCUMENT_ID}/versions/${TEST_PRIVATE_VERSION_ID}`,
      );
      expect(res.status()).toBe(200);
      const { version } = await res.json();
      expect(version.id).toBe(TEST_PRIVATE_VERSION_ID);
    });
  });

  test.describe('another member of the same org reaches nothing', () => {
    let other: APIRequestContext;

    test.beforeAll(async ({ playwright, baseURL }) => {
      other = await asOtherUser(playwright.request, baseURL!);
    });

    test.afterAll(async () => {
      await other?.dispose();
    });

    test('cannot download the file', async () => {
      const res = await other.get(`/api/files/${TEST_PRIVATE_FILE_ID}`);
      expect(res.status()).toBe(404);
    });

    test('cannot read the thumbnail', async () => {
      const res = await other.get(
        `/api/files/${TEST_PRIVATE_FILE_ID}/thumbnail`,
      );
      expect(res.status()).toBe(404);
    });

    test('cannot list versions', async () => {
      const res = await other.get(
        `/api/documents/${TEST_PRIVATE_DOCUMENT_ID}/versions`,
      );
      expect(res.status()).toBe(404);
    });

    test('cannot read version content', async () => {
      const res = await other.get(
        `/api/documents/${TEST_PRIVATE_DOCUMENT_ID}/versions/${TEST_PRIVATE_VERSION_ID}`,
      );
      expect(res.status()).toBe(404);
    });

    test('cannot read the optimization job', async () => {
      const res = await other.get(
        `/api/documents/${TEST_PRIVATE_DOCUMENT_ID}/optimization-job`,
      );
      expect(res.status()).toBe(404);
    });

    /**
     * The write paths, which matter more than the reads: a rollback or an
     * applied suggestion changes the active version and re-indexes it, so an
     * unauthorized member could alter what the assistant answers from.
     */
    test('cannot roll a version back', async () => {
      const res = await other.post(
        `/api/documents/${TEST_PRIVATE_DOCUMENT_ID}/versions/${TEST_PRIVATE_VERSION_ID}/rollback`,
      );
      expect(res.status()).toBe(404);
    });

    test('cannot start an AI optimization', async () => {
      const res = await other.post(
        `/api/documents/${TEST_PRIVATE_DOCUMENT_ID}/optimize-suggestions`,
      );
      expect(res.status()).toBe(404);
    });

    test('cannot apply AI suggestions', async () => {
      // Checked before the body is parsed, so the answer is 404 rather than a
      // validation error that would confirm the id exists.
      const res = await other.post(
        `/api/documents/${TEST_PRIVATE_DOCUMENT_ID}/apply-suggestions`,
        { data: { acceptedSuggestionIds: ['whatever'] } },
      );
      expect(res.status()).toBe(404);
    });

    test('the rollback attempt left the document untouched', async ({
      browser,
    }) => {
      // Proves the 404s above were refusals rather than something that failed
      // after writing. Read back as the owner.
      const ctx = await browser.newContext({ storageState: AUTH_FILE });
      const res = await ctx.request.get(
        `/api/documents/${TEST_PRIVATE_DOCUMENT_ID}/versions`,
      );
      expect(res.status()).toBe(200);
      const { versions } = await res.json();
      expect(versions).toHaveLength(1);
      await ctx.close();
    });
  });
});
