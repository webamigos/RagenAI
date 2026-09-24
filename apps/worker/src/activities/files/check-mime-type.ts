import { logger } from '../../services/logger.js';
import {
  ensureLocalFile,
  type FileLocator,
} from '../../services/ensure-local-file.js';
import { getFileExtension } from '../../utils/get-file-extension.js';

export type DetectedMimeType = { ext: string; mime: string };

/**
 * ZIP-based formats, by the extension the upload carried.
 *
 * `file-type` recognises these by looking inside the archive for a specific
 * part (`[Content_Types].xml` naming the main document, or EPUB's `mimetype`).
 * When that part is missing or unrecognised — producers differ, and the
 * format does not require the order Word happens to use — it reports the
 * container, `application/zip`, which no loader accepts. The magic bytes have
 * already proven the file is a ZIP; the name is trusted only to say which
 * kind, and only among these four.
 */
const ZIP_CONTAINER_BY_EXTENSION: Record<string, DetectedMimeType> = {
  docx: {
    ext: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  xlsx: {
    ext: 'xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  pptx: {
    ext: 'pptx',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  },
  epub: { ext: 'epub', mime: 'application/epub+zip' },
};

/**
 * Narrows a generic ZIP to the Office/EPUB format its name claims. Anything
 * else — a real `.zip`, or a ZIP named `.txt` — is returned unchanged, and is
 * refused downstream as an unsupported mime type.
 */
export function resolveZipContainer(
  detected: DetectedMimeType,
  fileName: string,
): DetectedMimeType {
  if (detected.mime !== 'application/zip') {
    return detected;
  }
  const extension = getFileExtension(fileName).toLowerCase();
  return (extension && ZIP_CONTAINER_BY_EXTENSION[extension]) || detected;
}

export const checkMimeType = async (
  locator: FileLocator,
): Promise<DetectedMimeType | null> => {
  try {
    const filePath = await ensureLocalFile(locator);

    // From the file, not from its first 4100 bytes. For a ZIP, `file-type`
    // walks the entries looking for the one that names the format; handed a
    // truncated buffer it runs off the end of it and throws
    // `EndOfStreamError` whenever that entry is not in the window — which
    // this catch used to turn into "Cannot detect mime type" for a valid
    // Office file. Reading the file lets it seek as far as it needs.
    const { fileTypeFromFile } = await import('file-type');
    const detected = await fileTypeFromFile(filePath);
    if (!detected) {
      return null;
    }
    return resolveZipContainer(
      { ext: detected.ext, mime: detected.mime },
      locator.fileName,
    );
  } catch {
    logger.error('Error detecting mime type');
    return null;
  }
};
