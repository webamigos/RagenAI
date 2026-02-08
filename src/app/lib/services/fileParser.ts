import { getFileType } from '../utils/getFileType';
import { getFileExtension } from '../utils/getFileExtension';
import { FileType } from '@/generated/prisma/client';

export type ParsedFile = {
  content: string | Buffer;
  fileName: string;
  fileType: FileType;
  fileExtension?: string;
};

type FileParser = (
  file: File,
  organizationId?: string
) => Promise<string | Buffer>;

const fileParsers: Record<FileType, FileParser> = {
  SRT: async (file) => {
    const buffer = await file.arrayBuffer();
    return new TextDecoder().decode(buffer);
  },
  PDF: async (file) => Buffer.from(await file.arrayBuffer()),
  EPUB: async (file) => Buffer.from(await file.arrayBuffer()),
  TEXT: async (file) => file.text(),
  MARKDOWN: async (file) => file.text(),
  URL: async (file) => file.text(),
  UNKNOWN: async (file) => file.text(),
};

export async function parseFile(
  file: File,
  organizationId?: string
): Promise<ParsedFile> {
  if (file.size === 0) {
    throw new Error(`The file ${file.name} is empty`);
  }

  const fileType = getFileType(file.name);

  if (!fileParsers[fileType]) {
    throw new Error(`Unsupported file type: ${file.name}`);
  }

  const content = await fileParsers[fileType](file, organizationId);

  const fileExtension = getFileExtension(file.name);

  return { content, fileName: file.name, fileType, fileExtension };
}

export { getFileType };
