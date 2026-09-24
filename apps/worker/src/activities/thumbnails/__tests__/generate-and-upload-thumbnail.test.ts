import { FileType } from '../../../types/UserFile.js';

/**
 * #1299: a type with no renderer is a decision, not a failure.
 *
 * DOCX and XLSX used to throw, and the ingest handler's best-effort `catch`
 * logged every one of them as a warning. They now resolve to `null` — and a
 * real failure (storage, `sharp`) still throws, so the caller's `warn` keeps
 * meaning something.
 */
const mocks = vi.hoisted(() => ({
  ensureLocalFile: vi.fn(),
  uploadRaw: vi.fn(),
  toBuffer: vi.fn(),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../services/ensure-local-file.js', () => ({
  ensureLocalFile: mocks.ensureLocalFile,
}));

vi.mock('../../../services/aws.js', () => ({
  aws: { uploadRaw: mocks.uploadRaw },
}));

vi.mock('../../../services/logger.js', () => ({ logger: mocks.logger }));

vi.mock('sharp', () => ({
  default: () => ({
    resize: () => ({ png: () => ({ toBuffer: mocks.toBuffer }) }),
  }),
}));

// Native renderers the image path never reaches; stubbed so the module loads
// without them.
vi.mock('@resvg/resvg-js', () => ({ Resvg: vi.fn() }));
vi.mock('@hyzyla/pdfium', () => ({ PDFiumLibrary: { init: vi.fn() } }));

import { generateAndUploadThumbnail } from '../generate-and-upload-thumbnail.js';

const locator = { orgId: 'org-1', fileId: 'file-1', fileName: 'a.bin' };

describe('generateAndUploadThumbnail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureLocalFile.mockResolvedValue('/tmp/a.bin');
    mocks.toBuffer.mockResolvedValue(Buffer.from('png'));
    mocks.uploadRaw.mockResolvedValue(undefined);
  });

  it.each([FileType.DOCX, FileType.XLSX])(
    'resolves %s to null, without fetching, uploading or warning',
    async (fileType) => {
      await expect(
        generateAndUploadThumbnail({ ...locator, fileType }),
      ).resolves.toBeNull();

      expect(mocks.ensureLocalFile).not.toHaveBeenCalled();
      expect(mocks.uploadRaw).not.toHaveBeenCalled();
      expect(mocks.logger.warn).not.toHaveBeenCalled();
      expect(mocks.logger.error).not.toHaveBeenCalled();
    },
  );

  it('uploads a supported type and returns its key', async () => {
    await expect(
      generateAndUploadThumbnail({ ...locator, fileType: FileType.IMAGE }),
    ).resolves.toBe('org-1/thumbnails/file-1.png');

    expect(mocks.uploadRaw).toHaveBeenCalledWith(
      'org-1/thumbnails/file-1.png',
      Buffer.from('png'),
    );
  });

  it('still throws when the upload fails', async () => {
    mocks.uploadRaw.mockRejectedValue(new Error('S3 is down'));

    await expect(
      generateAndUploadThumbnail({ ...locator, fileType: FileType.IMAGE }),
    ).rejects.toThrow('S3 is down');
  });

  it('still throws when sharp fails', async () => {
    mocks.toBuffer.mockRejectedValue(new Error('sharp: unsupported image'));

    await expect(
      generateAndUploadThumbnail({ ...locator, fileType: FileType.IMAGE }),
    ).rejects.toThrow('sharp: unsupported image');
    expect(mocks.uploadRaw).not.toHaveBeenCalled();
  });

  it('still throws for a type nothing here knows — that one is a bug', async () => {
    await expect(
      generateAndUploadThumbnail({ ...locator, fileType: FileType.EPUB }),
    ).rejects.toThrow('Thumbnail generation not supported for file type: EPUB');
  });
});
