import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { FileLocator } from '../../../services/ensure-local-file.js';
import { SUPPORTED_MIME_TYPES } from '../../../utils/supported-mime-types.js';
import { FileType } from '../../../types/UserFile.js';
import { buildZip, MINIMAL_FILES } from './fixtures/minimal-zip.js';

const { resolvePath } = vi.hoisted(() => ({
  resolvePath: { dir: '' },
}));

vi.mock('../../../services/ensure-local-file.js', () => ({
  ensureLocalFile: async (locator: FileLocator) =>
    path.join(resolvePath.dir, locator.fileName),
}));

vi.mock('../../../services/logger.js', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { checkMimeType, resolveZipContainer } from '../check-mime-type.js';

const locatorFor = (fileName: string): FileLocator => ({
  orgId: 'org-1',
  fileId: 'file-1',
  fileName,
});

/**
 * An archive `file-type` cannot name: no `[Content_Types].xml`, and its only
 * document part sits after 6 KB of another entry. Two failures in one fixture —
 * past the 4100 bytes this activity used to read, `file-type` threw
 * `EndOfStreamError` and the activity answered `null`; read whole, it reports
 * the container, `application/zip`, which the name then narrows.
 */
const opaqueZip = buildZip([
  { name: 'docProps/thumbnail.bin', content: Buffer.alloc(6000, 0x41) },
  { name: 'word/document.xml', content: '<w:document/>' },
]);

const EXPECTED: Record<string, FileType> = {
  docx: FileType.DOCX,
  xlsx: FileType.XLSX,
  pptx: FileType.PPTX,
  epub: FileType.EPUB,
};

describe('checkMimeType', () => {
  beforeAll(async () => {
    resolvePath.dir = await mkdtemp(path.join(tmpdir(), 'mime-detection-'));
    for (const [ext, bytes] of Object.entries(MINIMAL_FILES)) {
      await writeFile(path.join(resolvePath.dir, `report.${ext}`), bytes);
      await writeFile(path.join(resolvePath.dir, `opaque.${ext}`), opaqueZip);
    }
    await writeFile(path.join(resolvePath.dir, 'archive.zip'), opaqueZip);
  });

  afterAll(async () => {
    await rm(resolvePath.dir, { recursive: true, force: true });
  });

  it.each(Object.keys(EXPECTED))(
    'detects a .%s as a supported type from its bytes',
    async (ext) => {
      const detected = await checkMimeType(locatorFor(`report.${ext}`));
      expect(detected?.ext).toBe(ext);
      expect(SUPPORTED_MIME_TYPES[detected!.mime]).toBe(EXPECTED[ext]);
    },
  );

  it.each(Object.keys(EXPECTED))(
    'narrows a ZIP that file-type cannot identify to .%s by its name',
    async (ext) => {
      const detected = await checkMimeType(locatorFor(`opaque.${ext}`));
      expect(detected?.ext).toBe(ext);
      expect(SUPPORTED_MIME_TYPES[detected!.mime]).toBe(EXPECTED[ext]);
    },
  );

  it('leaves a real .zip a ZIP, which no loader accepts', async () => {
    const detected = await checkMimeType(locatorFor('archive.zip'));
    expect(detected).toEqual({ ext: 'zip', mime: 'application/zip' });
    expect(SUPPORTED_MIME_TYPES[detected!.mime]).toBeUndefined();
  });
});

describe('resolveZipContainer', () => {
  const zip = { ext: 'zip', mime: 'application/zip' };

  it('trusts the name only for a ZIP', () => {
    const pdf = { ext: 'pdf', mime: 'application/pdf' };
    expect(resolveZipContainer(pdf, 'report.docx')).toBe(pdf);
  });

  it('ignores the case of the extension', () => {
    expect(resolveZipContainer(zip, 'REPORT.DOCX').ext).toBe('docx');
  });

  it('does not turn a ZIP named .txt into text', () => {
    expect(resolveZipContainer(zip, 'notes.txt')).toBe(zip);
  });
});
