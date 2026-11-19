import type { JobContext } from '@ragenai/jobs';
import { describe, expect, it, vi } from 'vitest';

import {
  createMockActivities,
  makeUserFile,
} from '../../__tests__/fixtures/mock-activities.js';
import { runFileEmbeddings } from '../parse-and-embed.js';

/**
 * A re-embed picks its job when it enqueues: `runFileEmbeddings` while the
 * active version is the upload, `reindexDocumentVersion` once it is an edit.
 * The job can wait in the queue. An edit made meanwhile must not be replaced
 * in the index by the original upload (AGENTS.md, "Document Versions"), so a
 * re-embed has the handler look again when it starts.
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

function setup(active: { documentId: string; changeType: string } | null) {
  const activities = createMockActivities();
  activities.getFileRecord.mockResolvedValue(
    makeUserFile({ fileName: 'regulamin.pdf' }),
  );
  activities.getActiveDocumentVersion.mockResolvedValue(active);
  return activities;
}

const payload = { fileId: 'file-1', orgId: 'org-1' };

describe('runFileEmbeddings — a re-embed keeps the active version', () => {
  it.each(['MANUAL', 'AI_REWRITE', 'AI_OPTIMIZE', 'ROLLBACK'])(
    're-indexes the %s version instead of parsing the stored upload',
    async (changeType) => {
      const activities = setup({ documentId: 'doc-1', changeType });

      await runFileEmbeddings(
        { ...payload, keepActiveVersion: true },
        context(activities),
      );

      expect(activities.getActiveDocumentVersion).toHaveBeenCalledWith(payload);
      // The version's text is read and embedded…
      expect(activities.getDocumentContent).toHaveBeenCalledWith({
        documentId: 'doc-1',
        orgId: 'org-1',
      });
      expect(activities.addDocumentsToVectorStore).toHaveBeenCalled();
      // …and the stored file is never opened.
      expect(activities.getDocumentParser).not.toHaveBeenCalled();
      // The bulk re-index reset parsing to NOT_STARTED before it queued the
      // job. Nothing parses on this path, so it is closed, not left pending.
      expect(activities.updateParsingStatus).toHaveBeenCalledTimes(1);
      expect(activities.updateParsingStatus).toHaveBeenCalledWith({
        fileId: 'file-1',
        orgId: 'org-1',
        status: 'COMPLETED',
      });
    },
  );

  // The version re-index deletes the file's chunks before it writes the new
  // ones. A re-embed cancelled while it waited must stop before that, as it
  // does on the parse path, or the document is left with no chunks at all.
  it('stops before the hand-over when the re-embed was cancelled', async () => {
    const activities = setup({ documentId: 'doc-1', changeType: 'MANUAL' });
    const ctx = context(activities);
    vi.mocked(ctx.checkCancelled).mockResolvedValue(true);

    await expect(
      runFileEmbeddings({ ...payload, keepActiveVersion: true }, ctx),
    ).rejects.toMatchObject({ type: 'IngestCancelled' });

    expect(activities.getDocumentContent).not.toHaveBeenCalled();
    expect(activities.deleteDocumentVectors).not.toHaveBeenCalled();
    expect(activities.addDocumentsToVectorStore).not.toHaveBeenCalled();
    expect(activities.updateParsingStatus).toHaveBeenCalledWith({
      fileId: 'file-1',
      orgId: 'org-1',
      status: 'CANCELLED',
    });
  });

  it('parses the stored file while the active version is still the upload', async () => {
    const activities = setup({ documentId: 'doc-1', changeType: 'UPLOAD' });

    await runFileEmbeddings(
      { ...payload, keepActiveVersion: true },
      context(activities),
    );

    expect(activities.getDocumentParser).toHaveBeenCalled();
    expect(activities.getDocumentContent).not.toHaveBeenCalled();
  });

  it('parses the stored file when the file has no document yet', async () => {
    const activities = setup(null);

    await runFileEmbeddings(
      { ...payload, keepActiveVersion: true },
      context(activities),
    );

    expect(activities.getDocumentParser).toHaveBeenCalled();
  });

  // An upload or a Drive sync brings new content. Parsing the stored file is
  // the point there, whatever the active version was, and the version is not
  // even read.
  it('does not look, and parses, when the producer brought new content', async () => {
    const activities = setup({ documentId: 'doc-1', changeType: 'MANUAL' });

    await runFileEmbeddings(payload, context(activities));

    expect(activities.getActiveDocumentVersion).not.toHaveBeenCalled();
    expect(activities.getDocumentParser).toHaveBeenCalled();
    expect(activities.getDocumentContent).not.toHaveBeenCalled();
  });
});
