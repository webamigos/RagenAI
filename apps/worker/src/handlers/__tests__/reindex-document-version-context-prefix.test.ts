import type { JobContext } from '@ragenai/jobs';
import { describe, expect, it, vi } from 'vitest';

import { createMockActivities } from '../../__tests__/fixtures/mock-activities.js';
import type { Document } from '../../types/Document.js';
import { reindexDocumentVersion } from '../reindex-document-version.js';

/**
 * A failed context-prefix step re-indexes the version without a prefix — and
 * says so, since the step's own retries log only the attempts it will repeat.
 */
const payload = {
  orgId: 'org-1',
  fileId: 'file-1',
  fileName: 'umowa.md',
  projectId: 'proj-1',
  userId: 'user-1',
  documentId: 'doc-1',
};

describe('reindexDocumentVersion — context prefix', () => {
  it('indexes without a prefix and logs the failure when the step fails', async () => {
    const activities = createMockActivities();
    activities.applyContextPrefix.mockRejectedValue(new Error('step failed'));
    const warn = vi.fn();
    const ctx: JobContext = {
      runId: 'run-1',
      steps: <A>() => activities as unknown as A,
      log: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() },
      progress: vi.fn(),
      checkCancelled: vi.fn().mockResolvedValue(false),
    };

    await expect(reindexDocumentVersion(payload, ctx)).resolves.toBe('file-1');

    const prepared = activities.prepareMetadata.mock.calls[0]![0] as {
      docs: Document[];
    };
    expect(
      prepared.docs.some((d) => d.metadata && 'contextPrefix' in d.metadata),
    ).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'Context prefix failed for file file-1; indexing without one: step failed',
      ),
    );
  });
});
