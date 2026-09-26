/**
 * What `loadDocling` tells the step's retry policy when Docling fails.
 *
 * The strict policy waits about six minutes across six attempts. That is right
 * for a Docling that is busy or restarting and wrong for a document it refused,
 * where every attempt is another full conversion ending the same way. The
 * activity is where the difference becomes `retryable: false`, because the
 * policy only knows how to read that.
 */
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from('bytes')),
}));
vi.mock('../../../services/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../services/ensure-local-file.js', () => ({
  ensureLocalFile: vi.fn().mockResolvedValue('/tmp/f.pdf'),
}));

import { loadDocling } from '../load-docling.js';
import { FileType } from '../../../types/UserFile.js';

const load = () =>
  loadDocling({
    orgId: 'org-1',
    fileId: 'file-1',
    fileName: 'f.pdf',
    fileType: FileType.PDF,
  });

const rejection = async () =>
  load().then(
    () => {
      throw new Error('expected loadDocling to fail');
    },
    (e: unknown) => e as Error & { retryable?: boolean },
  );

beforeEach(() => {
  mockFetch.mockReset();
});

describe('loadDocling failures', () => {
  it('stops retrying a document Docling refused', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'failure',
        errors: ['cannot read file'],
        document: {},
      }),
    });

    const error = await rejection();
    expect(error.name).toBe('JobFailure');
    expect(error.retryable).toBe(false);
    expect(error.message).toContain('cannot read file');
  });

  it('leaves a busy Docling to be waited out', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'busy',
    });

    const error = await rejection();
    expect(error.name).toBe('DoclingError');
    expect(error.retryable).toBeUndefined();
  });
});
