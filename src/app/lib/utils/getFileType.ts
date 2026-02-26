import { type FileType } from '@/generated/prisma/browser';

export const getFileType = (fileName: string): FileType => {
  if (fileName.endsWith('.srt')) return 'SRT';
  if (fileName.endsWith('.epub')) return 'EPUB';
  if (fileName.endsWith('.pdf')) return 'PDF';
  if (fileName.endsWith('.md') || fileName.endsWith('.txt')) return 'TEXT';

  throw new Error(`Unknown file type: ${fileName}`);
};
