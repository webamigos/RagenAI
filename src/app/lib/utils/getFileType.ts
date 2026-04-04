import { type FileType } from '@/generated/prisma/browser';

export const getFileType = (fileName: string): FileType => {
  const lower = fileName.toLowerCase();

  if (lower.endsWith('.srt')) {
    return 'SRT';
  }
  if (lower.endsWith('.epub')) {
    return 'EPUB';
  }
  if (lower.endsWith('.pdf')) {
    return 'PDF';
  }
  if (lower.endsWith('.md') || lower.endsWith('.txt')) {
    return 'TEXT';
  }
  if (
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.png') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.gif')
  ) {
    return 'IMAGE';
  }
  if (lower.endsWith('.csv')) {
    return 'CSV';
  }
  if (lower.endsWith('.docx')) {
    return 'DOCX';
  }
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    return 'XLSX';
  }

  throw new Error(`Unknown file type: ${fileName}`);
};
