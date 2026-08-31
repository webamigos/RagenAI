import { getFileType, getFileExtension } from './utils/file-type.js';
import { type FileType } from '../generated/prisma/client.js';

export type ParsedFile = {
  content: string | Buffer;
  fileName: string;
  fileType: FileType;
  fileExtension?: string;
};

/**
 * Ported from ragen-app's
 * src/features/documents/utils/file-parser.ts (`parseFile`). See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * Adapted for apps/api's upload path, which receives an
 * `Express.Multer.File` (memory storage, buffer already resident) rather
 * than a web-standard `File` — no `arrayBuffer()`/`text()` reads needed,
 * `file.buffer` is already the raw bytes. Text-typed files are decoded
 * from that buffer instead. Behavior (which types decode to text vs.
 * pass through as a `Buffer`) is otherwise unchanged: the actual
 * heavy-lifting parse (PDF text extraction, DOCX, etc.) happens later in
 * ragen-worker's Temporal activity, not here — this only type-detects
 * and reads the raw content for the upload+S3 step.
 */
export function parseFile(file: Express.Multer.File): ParsedFile {
  if (file.size === 0) {
    throw new Error(`The file ${file.originalname} is empty`);
  }

  const fileType = getFileType(file.originalname);
  const textTypes: FileType[] = ['SRT', 'TEXT', 'MARKDOWN', 'URL', 'CSV'];
  const content = textTypes.includes(fileType)
    ? file.buffer.toString('utf-8')
    : file.buffer;

  const fileExtension = getFileExtension(file.originalname);

  return { content, fileName: file.originalname, fileType, fileExtension };
}
