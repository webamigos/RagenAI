import type { JobContext } from '@ragenai/jobs';
import { describe, expect, it, vi } from 'vitest';

import {
  createMockActivities,
  makeUserFile,
} from '../../__tests__/fixtures/mock-activities.js';
import { runFileEmbeddings } from '../parse-and-embed.js';

/**
 * Spec 2026-09-26-docling-under-load, C1: a Docling fallback on a PDF is an
 * error in the log, because the legacy PDF loader sends the document to an
 * external model. For any other type it stays a warning.
 */
function run(fileName: string, mime: string) {
  const activities = createMockActivities();
  activities.getDocumentParser.mockResolvedValue({
    parser: 'docling',
    strict: false,
  });
  activities.loadDocling.mockRejectedValue(new Error('ECONNREFUSED'));
  activities.checkIsBinaryFile.mockResolvedValue(true);
  activities.checkMimeType.mockResolvedValue({
    mime,
    ext: fileName.split('.').pop(),
  });
  activities.getFileRecord.mockResolvedValue(makeUserFile({ fileName }));
  const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const ctx: JobContext = {
    runId: 'run-1',
    steps: <A>() => activities as unknown as A,
    log,
    progress: vi.fn(),
    checkCancelled: vi.fn().mockResolvedValue(false),
  };
  return { done: runFileEmbeddings({ fileId: 'f', orgId: 'o' }, ctx), log };
}

const fallbackLines = (calls: unknown[][]) =>
  calls.filter(([msg]) => String(msg).includes('falling back'));

describe('runFileEmbeddings — the Docling fallback in the log', () => {
  it('is an error for a PDF, naming the type', async () => {
    const { done, log } = run('umowa.pdf', 'application/pdf');
    await done;
    expect(fallbackLines(log.error.mock.calls)).toHaveLength(1);
    expect(String(fallbackLines(log.error.mock.calls)[0][0])).toContain(
      '(PDF)',
    );
    expect(fallbackLines(log.warn.mock.calls)).toHaveLength(0);
  });

  it('stays a warning for a type the fallback parses locally', async () => {
    const { done, log } = run(
      'umowa.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    await done;
    expect(fallbackLines(log.warn.mock.calls)).toHaveLength(1);
    expect(fallbackLines(log.error.mock.calls)).toHaveLength(0);
  });
});
