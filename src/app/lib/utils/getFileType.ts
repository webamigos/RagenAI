import { SupportedFileType } from '../services/fileParser';

export const getFileType = (fileName: string): SupportedFileType => {
  if (fileName.endsWith('.srt')) return 'srt';
  if (fileName.endsWith('.epub')) return 'epub';
  if (fileName.endsWith('.pdf')) return 'pdf';
  if (fileName.endsWith('.md') || fileName.endsWith('.txt')) return 'text';

  throw new Error(`Unknown file type: ${fileName}`);
};
