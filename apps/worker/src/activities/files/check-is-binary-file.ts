import { open } from 'node:fs/promises';

import { isBinary } from 'istextorbinary';
import {
  ensureLocalFile,
  type FileLocator,
} from '../../services/ensure-local-file.js';

/**
 * How much of the file is read to decide. `istextorbinary` samples the start,
 * middle and end of whatever it is given, so the head is enough: a container
 * format announces itself in its first bytes, and a text file is text there.
 */
export const BINARY_SNIFF_BYTES = 8 * 1024;

/**
 * Whether a file is binary, decided by its **content**, never its name.
 *
 * This used to be `isBinary(filePath) ?? false`. Given a path alone,
 * `istextorbinary` checks nothing but the extension against its two lists —
 * and DOCX, XLSX, PPTX and EPUB are on neither, so it answered `null`, which
 * became "text". The handler then skipped mime detection, recorded the file
 * as TEXT, and on a Docling outage read the ZIP with `readFile(…, 'utf-8')`
 * and indexed the bytes. Passing `null` as the name makes it look at the
 * buffer only, so a renamed or unknown extension cannot decide the answer.
 */
export const checkIsBinaryFile = async (
  locator: FileLocator,
): Promise<boolean> => {
  const filePath = await ensureLocalFile(locator);
  const head = await readHead(filePath, BINARY_SNIFF_BYTES);
  // An empty file has no content to be binary; it is an (empty) text file.
  if (head.length === 0) {
    return false;
  }
  return isBinary(null, head) ?? false;
};

async function readHead(filePath: string, length: number): Promise<Buffer> {
  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}
