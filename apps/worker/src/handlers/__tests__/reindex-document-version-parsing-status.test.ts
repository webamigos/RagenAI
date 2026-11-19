import type { JobContext } from '@ragenai/jobs';
import { describe, expect, it, vi } from 'vitest';

import {
  createMockActivities,
  makeUserFile,
} from '../../__tests__/fixtures/mock-activities.js';
import { ParsingStatus } from '../../types/UserFile.js';
import { reindexDocumentVersion } from '../reindex-document-version.js';

/**
 * A bulk re-index resets `parsingStatus` to NOT_STARTED before it starts a
 * job, whichever job that turns out to be. This one parses nothing, so it
 * never used to write the column — and a file whose vectors were written
 * still read as "being ingested": `isIngestInProgress` said so, and the next
 * re-index left it out.
 */
const payload = {
  orgId: 'org-1',
  fileId: 'file-1',
  fileName: 'umowa.md',
  projectId: 'proj-1',
  userId: null,
  documentId: 'doc-1',
};

function run(parsingStatus: ParsingStatus) {
  const activities = createMockActivities();
  activities.getFileRecord.mockResolvedValue(makeUserFile({ parsingStatus }));
  const ctx: JobContext = {
    runId: 'run-1',
    steps: <A>() => activities as unknown as A,
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    progress: vi.fn(),
    checkCancelled: vi.fn().mockResolvedValue(false),
  };
  return { activities, done: reindexDocumentVersion(payload, ctx) };
}

describe('reindexDocumentVersion — the parsing status', () => {
  it('closes a parsing status a bulk re-index reset', async () => {
    const { activities, done } = run(ParsingStatus.NOT_STARTED);
    await expect(done).resolves.toBe('file-1');

    expect(activities.updateParsingStatus).toHaveBeenCalledTimes(1);
    expect(activities.updateParsingStatus).toHaveBeenCalledWith({
      fileId: 'file-1',
      orgId: 'org-1',
      status: ParsingStatus.COMPLETED,
    });
  });

  // An edit or a rollback of a file that was parsed long ago: the column
  // already says so, and its timestamp is the parse's, not this run's.
  it.each([
    ParsingStatus.COMPLETED,
    ParsingStatus.FAILED,
    ParsingStatus.CANCELLED,
  ])('leaves a %s parsing status as it is', async (parsingStatus) => {
    const { activities, done } = run(parsingStatus);
    await expect(done).resolves.toBe('file-1');

    expect(activities.updateParsingStatus).not.toHaveBeenCalled();
  });

  it('closes it before the index is touched, so a failed embed is not left pending', async () => {
    const { activities, done } = run(ParsingStatus.NOT_STARTED);
    await done;

    expect(
      activities.updateParsingStatus.mock.invocationCallOrder[0],
    ).toBeLessThan(
      activities.deleteDocumentVectors.mock.invocationCallOrder[0]!,
    );
  });
});
