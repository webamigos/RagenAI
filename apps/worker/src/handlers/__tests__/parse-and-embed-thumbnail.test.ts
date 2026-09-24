import type { JobContext } from '@ragenai/jobs';
import { describe, expect, it, vi } from 'vitest';

import {
  createMockActivities,
  makeUserFile,
} from '../../__tests__/fixtures/mock-activities.js';
import { runFileEmbeddings } from '../parse-and-embed.js';

/**
 * #1299, from the handler's side: the thumbnail step's `warn` is for a real
 * failure only. A type with no renderer comes back as `null` and is skipped
 * without a log line; a thrown failure still warns and still does not fail the
 * ingest.
 *
 * Runs the handler directly with a fake context, so the log calls can be read
 * — `workflow.spec.ts` covers the same path under Temporal, where they cannot.
 */
function context(activities: ReturnType<typeof createMockActivities>) {
  const ctx: JobContext = {
    runId: 'run-1',
    steps: <A>() => activities as unknown as A,
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    progress: vi.fn(),
    checkCancelled: vi.fn().mockResolvedValue(false),
  };
  return ctx;
}

function thumbnailWarnings(ctx: JobContext) {
  return vi
    .mocked(ctx.log.warn)
    .mock.calls.filter(([message]) => String(message).includes('Thumbnail'));
}

describe('runFileEmbeddings — thumbnail step', () => {
  it('skips a type with no renderer without warning and without writing a key', async () => {
    const activities = createMockActivities();
    activities.generateAndUploadThumbnail.mockResolvedValue(null);
    activities.getFileRecord.mockResolvedValue(
      makeUserFile({ fileName: 'readme.txt' }),
    );
    const ctx = context(activities);

    const result = await runFileEmbeddings(
      { fileId: 'file-1', orgId: 'org-1' },
      ctx,
    );

    expect(result).toContain('success');
    expect(activities.generateAndUploadThumbnail).toHaveBeenCalled();
    expect(activities.updateThumbnailKey).not.toHaveBeenCalled();
    expect(thumbnailWarnings(ctx)).toEqual([]);
  });

  it('writes the key when a thumbnail was made', async () => {
    const activities = createMockActivities();
    activities.getFileRecord.mockResolvedValue(
      makeUserFile({ fileName: 'readme.txt' }),
    );
    const ctx = context(activities);

    await runFileEmbeddings({ fileId: 'file-1', orgId: 'org-1' }, ctx);

    expect(activities.updateThumbnailKey).toHaveBeenCalledWith(
      expect.objectContaining({
        thumbnailS3Key: 'org-1/thumbnails/pub-1.png',
      }),
    );
    expect(thumbnailWarnings(ctx)).toEqual([]);
  });

  it('still warns on a real failure, and the ingest still succeeds', async () => {
    const activities = createMockActivities();
    activities.generateAndUploadThumbnail.mockRejectedValue(
      new Error('S3 is down'),
    );
    activities.getFileRecord.mockResolvedValue(
      makeUserFile({ fileName: 'readme.txt' }),
    );
    const ctx = context(activities);

    const result = await runFileEmbeddings(
      { fileId: 'file-1', orgId: 'org-1' },
      ctx,
    );

    expect(result).toContain('success');
    expect(activities.updateThumbnailKey).not.toHaveBeenCalled();
    expect(thumbnailWarnings(ctx)).toEqual([
      [expect.stringContaining('S3 is down')],
    ]);
  });
});
