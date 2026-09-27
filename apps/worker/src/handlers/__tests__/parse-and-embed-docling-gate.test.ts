import type { JobContext } from '@ragenai/jobs';
import { describe, expect, it, vi } from 'vitest';

import {
  createMockActivities,
  makeUserFile,
} from '../../__tests__/fixtures/mock-activities.js';
import { runFileEmbeddings } from '../parse-and-embed.js';

/**
 * Spec 2026-09-26-docling-under-load, B1: under DOCLING_STRICT, a Docling that
 * is down is waited out before the parse, so the strict step policy's
 * attempts are spent only on a Docling that answers.
 */
function context(
  activities: ReturnType<typeof createMockActivities>,
  cancelled = false,
) {
  const ctx: JobContext = {
    runId: 'run-1',
    steps: <A>() => activities as unknown as A,
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    progress: vi.fn(),
    checkCancelled: vi.fn().mockResolvedValue(cancelled),
  };
  return ctx;
}

function strictDocling(activities: ReturnType<typeof createMockActivities>) {
  activities.getDocumentParser.mockResolvedValue({
    parser: 'docling',
    strict: true,
  });
  activities.getFileRecord.mockResolvedValue(
    makeUserFile({ fileName: 'regulamin.pdf' }),
  );
}

const parsingStatuses = (a: ReturnType<typeof createMockActivities>) =>
  a.updateParsingStatus.mock.calls.map(
    ([arg]) => (arg as { status: string }).status,
  );

describe('runFileEmbeddings — the Docling gate', () => {
  it('parses once Docling is available', async () => {
    const activities = createMockActivities();
    strictDocling(activities);

    await runFileEmbeddings(
      { fileId: 'file-1', orgId: 'org-1' },
      context(activities),
    );

    expect(activities.waitForDocling).toHaveBeenCalledWith({
      fileId: 'file-1',
      orgId: 'org-1',
    });
    expect(activities.waitForDocling.mock.invocationCallOrder[0]).toBeLessThan(
      activities.loadDocling.mock.invocationCallOrder[0],
    );
    expect(parsingStatuses(activities)).toContain('COMPLETED');
  });

  it('fails the file, non-retryably and without a parse, when Docling never returns', async () => {
    const activities = createMockActivities();
    strictDocling(activities);
    activities.waitForDocling.mockResolvedValue({
      outcome: 'timed-out',
      waitedMs: 30 * 60_000,
      since: '2026-09-28T09:00:00.000Z',
    });

    await expect(
      runFileEmbeddings(
        { fileId: 'file-1', orgId: 'org-1' },
        context(activities),
      ),
    ).rejects.toMatchObject({
      retryable: false,
      message: expect.stringContaining(
        'unavailable since 2026-09-28T09:00:00.000Z',
      ),
    });
    expect(activities.loadDocling).not.toHaveBeenCalled();
    expect(activities.loadPdf).not.toHaveBeenCalled();
    expect(parsingStatuses(activities)).toContain('FAILED');
  });

  it('records a cancellation that arrived while waiting', async () => {
    const activities = createMockActivities();
    strictDocling(activities);
    activities.waitForDocling.mockResolvedValue({
      outcome: 'cancelled',
      waitedMs: 20_000,
    });

    await expect(
      runFileEmbeddings(
        { fileId: 'file-1', orgId: 'org-1' },
        context(activities, true),
      ),
    ).rejects.toMatchObject({ retryable: false });
    expect(activities.loadDocling).not.toHaveBeenCalled();
    expect(parsingStatuses(activities)).toContain('CANCELLED');
    expect(parsingStatuses(activities)).not.toContain('FAILED');
  });

  // With a fallback allowed, waiting would only delay the same fallback.
  it('does not wait when a fallback is allowed', async () => {
    const activities = createMockActivities();
    activities.getDocumentParser.mockResolvedValue({
      parser: 'docling',
      strict: false,
    });
    activities.getFileRecord.mockResolvedValue(
      makeUserFile({ fileName: 'regulamin.pdf' }),
    );

    await runFileEmbeddings(
      { fileId: 'file-1', orgId: 'org-1' },
      context(activities),
    );

    expect(activities.waitForDocling).not.toHaveBeenCalled();
  });
});
