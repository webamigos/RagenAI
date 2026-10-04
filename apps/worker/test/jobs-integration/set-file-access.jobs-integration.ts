import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DENSE_VECTOR_NAME, VECTOR_SIZE } from '@ragenai/rag-core';

import { qdrantService } from '../../src/services/qdrant.js';

/**
 * `setFileAccess` against a real Qdrant (#1245).
 *
 * The unit test for it mocks the client, so it can say what was asked for and
 * not what Qdrant did with it. That gap is where this bug lived: a payload keyed
 * `'metadata.accessible_by'` is accepted, reported as success and stored as a
 * literal top-level field, and a mock cannot tell. Likewise the filter that
 * keeps a published Brain page's chunks out of the rewrite is only a claim
 * until a server evaluates it. Both are asserted here the way retrieval reads
 * them — by filtering on `metadata.accessible_by`.
 *
 * Needs a Qdrant (`npm run ragen:up:full` locally; a service container in CI).
 * Locally an unreachable one skips the file with a note; in CI it fails, so a
 * misconfigured job cannot pass by not running.
 */

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';

async function reachable(): Promise<boolean> {
  // CI starts the service container and the job in the same breath, so wait for
  // it; locally one probe is enough to know there is none.
  const attempts = process.env.CI ? 30 : 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(`${QDRANT_URL}/healthz`, {
        signal: AbortSignal.timeout(3_000),
      });
      if (response.ok) {
        return true;
      }
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  return false;
}

const available = await reachable();

if (!available && process.env.CI) {
  throw new Error(
    `CI has no Qdrant at ${QDRANT_URL}: the access-sync test would be skipped and this job would still pass. Add the service to the job.`,
  );
}

// The name says why it is skipped, since a skipped suite prints nothing else.
describe.skipIf(!available)(
  `qdrantService.setFileAccess${available ? '' : ` (skipped: no Qdrant at ${QDRANT_URL}; start one with npm run ragen:up:full)`}`,
  () => {
    const orgId = `jobs-int-access-${randomUUID()}`;
    const vector = Array.from({ length: VECTOR_SIZE }, () => 0.1);

    type Client = import('@qdrant/js-client-rest').QdrantClient;
    let client: Client;
    let ids: Record<'plain' | 'plainToo' | 'brain' | 'other', string>;

    const point = (
      id: string,
      metadata: Record<string, unknown>,
    ): { id: string; vector: Record<string, number[]>; payload: unknown } => ({
      id,
      vector: { [DENSE_VECTOR_NAME]: vector },
      payload: { content: id, metadata },
    });

    /** The points a retrieval filter on `accessible_by` would return. */
    async function readableBy(principal: string): Promise<string[]> {
      const result = await client.scroll(orgId, {
        filter: {
          must: [
            { key: 'metadata.accessible_by', match: { any: [principal] } },
          ],
        },
        limit: 50,
        with_payload: false,
      });
      return result.points.map((p) => String(p.id)).sort();
    }

    beforeAll(async () => {
      const { QdrantClient } = await import('@qdrant/js-client-rest');
      client = new QdrantClient({
        url: QDRANT_URL,
        apiKey: process.env.QDRANT_API_KEY,
        checkCompatibility: false,
      });

      // Creates the collection with the worker's own vector config and indexes,
      // which is the collection `setFileAccess` will meet in production.
      await qdrantService.deleteByFileId({ orgId, fileId: randomUUID() });

      ids = {
        plain: randomUUID(),
        plainToo: randomUUID(),
        brain: randomUUID(),
        other: randomUUID(),
      };

      await client.upsert(orgId, {
        wait: true,
        points: [
          point(ids.plain, {
            file_id: 'file-1',
            accessible_by: ['user:owner', 'user:revoked'],
          }),
          point(ids.plainToo, {
            file_id: 'file-1',
            accessible_by: ['user:owner', 'user:revoked'],
          }),
          // A published Brain page is chunked under its own file id and takes its
          // access from the page.
          point(ids.brain, {
            file_id: 'file-1',
            brain_generation: 3,
            accessible_by: ['org:o'],
          }),
          point(ids.other, {
            file_id: 'file-2',
            accessible_by: ['user:owner', 'user:revoked'],
          }),
        ],
      });
    });

    afterAll(async () => {
      await client?.deleteCollection(orgId).catch(() => undefined);
    });

    it("rewrites the file's points so a revoked principal no longer matches the retrieval filter", async () => {
      expect(await readableBy('user:revoked')).toEqual(
        [ids.plain, ids.plainToo, ids.other].sort(),
      );

      await qdrantService.setFileAccess({
        orgId,
        fileId: 'file-1',
        accessibleBy: ['user:owner'],
      });

      // Gone from both of the file's ordinary points, and still there for the
      // other file, which the call did not name.
      expect(await readableBy('user:revoked')).toEqual([ids.other]);
      expect(await readableBy('user:owner')).toEqual(
        [ids.plain, ids.plainToo, ids.other].sort(),
      );
    });

    it('writes the field itself, not a dotted key beside it', async () => {
      const [stored] = await client.retrieve(orgId, {
        ids: [ids.plain],
        with_payload: true,
      });

      // A payload keyed 'metadata.accessible_by' is stored as exactly this: a
      // top-level key with a dot in its name, which the filter never reads.
      expect(Object.keys(stored.payload ?? {})).not.toContain(
        'metadata.accessible_by',
      );
      expect(
        (stored.payload as { metadata: { accessible_by: string[] } }).metadata
          .accessible_by,
      ).toEqual(['user:owner']);
    });

    it("leaves a published Brain page's chunks alone — their access is the page's", async () => {
      const [brain] = await client.retrieve(orgId, {
        ids: [ids.brain],
        with_payload: true,
      });

      expect(
        (brain.payload as { metadata: { accessible_by: string[] } }).metadata
          .accessible_by,
      ).toEqual(['org:o']);
    });

    it('writes an empty list as an empty list: a file nobody may reach matches nobody', async () => {
      await qdrantService.setFileAccess({
        orgId,
        fileId: 'file-1',
        accessibleBy: [],
      });

      expect(await readableBy('user:owner')).toEqual([ids.other]);
    });

    it('is not an error for a file with no points', async () => {
      await expect(
        qdrantService.setFileAccess({
          orgId,
          fileId: 'no-such-file',
          accessibleBy: ['user:owner'],
        }),
      ).resolves.toBeUndefined();
    });
  },
);
