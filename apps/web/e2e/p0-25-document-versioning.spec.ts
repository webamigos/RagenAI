import { test, expect } from '@playwright/test';

import {
  AUTH_FILE,
  TEST_DOCUMENT_ID,
  TEST_DOCUMENT_TITLE,
  TEST_DOCUMENT_V1_CONTENT,
  TEST_DOCUMENT_V1_ID,
  TEST_DOCUMENT_V2_CONTENT,
  TEST_DOCUMENT_V2_ID,
  TEST_ORG2_DOCUMENT_ID,
  TEST_ORG2_DOCUMENT_V1_ID,
} from './constants';

test.use({ storageState: AUTH_FILE });

/**
 * Runs against the seeded database, not against mocks. The previous version of
 * this file stubbed the same endpoints it then asserted on, so it could only
 * ever confirm that Playwright returned what Playwright was told to return.
 */
test.describe('Document versioning', () => {
  test('lists the seeded versions, newest first, with the active one marked', async ({
    request,
  }) => {
    const response = await request.get(
      `/api/documents/${TEST_DOCUMENT_ID}/versions`,
    );
    expect(response.status()).toBe(200);

    const { versions } = await response.json();
    expect(versions.map((v: { versionNumber: number }) => v.versionNumber)).toEqual([
      2, 1,
    ]);
    expect(versions[0]).toMatchObject({
      id: TEST_DOCUMENT_V2_ID,
      changeType: 'MANUAL',
      isActive: true,
    });
    expect(versions[1]).toMatchObject({ isActive: false });
  });

  test('returns the stored content for a single version', async ({
    request,
  }) => {
    const response = await request.get(
      `/api/documents/${TEST_DOCUMENT_ID}/versions/${TEST_DOCUMENT_V1_ID}`,
    );
    expect(response.status()).toBe(200);

    const { version } = await response.json();
    expect(version.content).toBe(TEST_DOCUMENT_V1_CONTENT);
    expect(version.title).toBe(TEST_DOCUMENT_TITLE);
  });

  test('rollback appends a version instead of rewriting history', async ({
    request,
  }) => {
    // Derived rather than hardcoded: this spec appends versions, so a second
    // run against the same seed would not start from 2.
    const before = await (
      await request.get(`/api/documents/${TEST_DOCUMENT_ID}/versions`)
    ).json();
    const countBefore = before.versions.length;
    const highestBefore = before.versions[0].versionNumber;

    const response = await request.post(
      `/api/documents/${TEST_DOCUMENT_ID}/versions/${TEST_DOCUMENT_V1_ID}/rollback`,
    );
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      newVersionNumber: highestBefore + 1,
    });

    const after = await request.get(
      `/api/documents/${TEST_DOCUMENT_ID}/versions`,
    );
    const { versions } = await after.json();

    // The rolled-back-from version is still there — a rollback can be undone.
    expect(versions).toHaveLength(countBefore + 1);
    expect(versions[0]).toMatchObject({
      versionNumber: highestBefore + 1,
      changeType: 'ROLLBACK',
      isActive: true,
    });
    expect(
      versions.filter((v: { isActive: boolean }) => v.isActive),
    ).toHaveLength(1);

    const restored = await request.get(
      `/api/documents/${TEST_DOCUMENT_ID}/versions/${versions[0].id}`,
    );
    expect((await restored.json()).version.content).toBe(
      TEST_DOCUMENT_V1_CONTENT,
    );

    // Restore the seeded content. This appends yet another version, which is
    // why nothing above is written as an absolute number.
    const reset = await request.post(
      `/api/documents/${TEST_DOCUMENT_ID}/versions/${TEST_DOCUMENT_V2_ID}/rollback`,
    );
    expect(reset.status()).toBe(200);

    const final = await (
      await request.get(`/api/documents/${TEST_DOCUMENT_ID}/versions`)
    ).json();
    const activeId = final.versions.find(
      (v: { isActive: boolean }) => v.isActive,
    ).id;
    const active = await request.get(
      `/api/documents/${TEST_DOCUMENT_ID}/versions/${activeId}`,
    );
    expect((await active.json()).version.content).toBe(TEST_DOCUMENT_V2_CONTENT);
  });

  test('will not read another organization document', async ({ request }) => {
    const response = await request.get(
      `/api/documents/${TEST_ORG2_DOCUMENT_ID}/versions`,
    );
    expect(response.status()).toBe(404);
  });

  test('will not roll back another organization document', async ({
    request,
  }) => {
    // The document id travels in the URL. Before the org check was added, the
    // version lookup keyed on (id, documentId) alone matched, and the rollback
    // appended a version to the other tenant's history while deactivating
    // every version they had.
    const response = await request.post(
      `/api/documents/${TEST_ORG2_DOCUMENT_ID}/versions/${TEST_ORG2_DOCUMENT_V1_ID}/rollback`,
    );
    expect(response.status()).toBe(404);

    const versions = await request.get(
      `/api/documents/${TEST_ORG2_DOCUMENT_ID}/versions`,
    );
    expect(versions.status()).toBe(404);
  });
});
