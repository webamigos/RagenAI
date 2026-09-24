import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { FileLocator } from '../../../services/ensure-local-file.js';
import { MINIMAL_FILES } from './fixtures/minimal-zip.js';

/**
 * `ensureLocalFile` downloads from S3 on a cache miss; here every locator
 * resolves to a real file in a temp directory, so what is tested is the
 * detection against real bytes — which is the part that was wrong.
 */
const { resolvePath } = vi.hoisted(() => ({
  resolvePath: { dir: '' },
}));

vi.mock('../../../services/ensure-local-file.js', () => ({
  ensureLocalFile: async (locator: FileLocator) =>
    path.join(resolvePath.dir, locator.fileName),
}));

import { checkIsBinaryFile } from '../check-is-binary-file.js';

const locatorFor = (fileName: string): FileLocator => ({
  orgId: 'org-1',
  fileId: 'file-1',
  fileName,
});

describe('checkIsBinaryFile', () => {
  beforeAll(async () => {
    resolvePath.dir = await mkdtemp(path.join(tmpdir(), 'binary-detection-'));

    for (const [ext, bytes] of Object.entries(MINIMAL_FILES)) {
      await writeFile(path.join(resolvePath.dir, `report.${ext}`), bytes);
    }
    // The same bytes under a name that claims text: the name must not win.
    await writeFile(
      path.join(resolvePath.dir, 'disguised.txt'),
      MINIMAL_FILES.docx,
    );
    await writeFile(
      path.join(resolvePath.dir, 'notes.txt'),
      'Zażółć gęślą jaźń — plain UTF-8 notes.\n'.repeat(400),
    );
    await writeFile(
      path.join(resolvePath.dir, 'readme.md'),
      '# Title\n\nSome *markdown* with `code`.\n',
    );
    await writeFile(path.join(resolvePath.dir, 'empty.txt'), '');
  });

  afterAll(async () => {
    await rm(resolvePath.dir, { recursive: true, force: true });
  });

  // Each of these returned `false` before the fix: `isBinary(path)` looked at
  // the extension only, and none of the four is on either of its lists.
  it.each(['docx', 'xlsx', 'pptx', 'epub'])(
    'calls a .%s binary',
    async (ext) => {
      await expect(checkIsBinaryFile(locatorFor(`report.${ext}`))).resolves.toBe(
        true,
      );
    },
  );

  it('calls a ZIP binary even when its name says .txt', async () => {
    await expect(checkIsBinaryFile(locatorFor('disguised.txt'))).resolves.toBe(
      true,
    );
  });

  it('calls a UTF-8 .txt text, Polish diacritics included', async () => {
    await expect(checkIsBinaryFile(locatorFor('notes.txt'))).resolves.toBe(
      false,
    );
  });

  it('calls a .md text', async () => {
    await expect(checkIsBinaryFile(locatorFor('readme.md'))).resolves.toBe(
      false,
    );
  });

  it('calls an empty file text', async () => {
    await expect(checkIsBinaryFile(locatorFor('empty.txt'))).resolves.toBe(
      false,
    );
  });
});
