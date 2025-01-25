import { parseSrtToSegmentsUsingLLM } from '@/app/api/threads/services/parseSrtWithLLM';
import OpenAI from 'openai';

import { getFileType } from '../utils/getFileType';
import { getFileExtension } from '../utils/getFileExtension';

export type ParsedFile = {
  content: string | Buffer;
  fileName: string;
  fileType: SupportedFileType;
  fileExtension?: string;
};

export type SupportedFileType = 'srt' | 'pdf' | 'epub' | 'text' | 'csv';

type FileParser = (
  file: File,
  organizationId?: string
) => Promise<string | Buffer>;

const fileParsers: Record<SupportedFileType, FileParser> = {
  srt: async (file, organizationId) => {
    if (!organizationId) {
      throw new Error('Organization ID is required for .srt files');
    }
    const fileText = await file.text();
    const segments = await parseSrtToSegmentsUsingLLM(
      organizationId,
      fileText,
      200,
      300
    );
    return segments.join('\n\n');
  },
  pdf: async (file) => Buffer.from(await file.arrayBuffer()),
  epub: async (file) => Buffer.from(await file.arrayBuffer()),
  csv: async (file) => file.text(),
  text: async (file) => file.text(),
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
