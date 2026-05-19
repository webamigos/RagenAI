import { getFileFromS3 } from '@/app/lib/services/storage';
import { FileType } from '@/generated/prisma/client';
import type { UserFile } from '@/generated/prisma/client';

type ScoringFile = Pick<
  UserFile,
  'fileName' | 'fileType' | 'fileExtension' | 'organizationId'
>;

function isPdf(file: ScoringFile): boolean {
  return (
    file.fileType === FileType.PDF ||
    file.fileExtension?.toLowerCase() === 'pdf'
  );
}

function isDocx(file: ScoringFile): boolean {
  return (
    file.fileExtension?.toLowerCase() === 'docx' ||
    file.fileExtension?.toLowerCase() === 'doc'
  );
}

export async function extractScoringFileText(
  file: ScoringFile,
): Promise<string> {
  const buffer = await getFileFromS3(file.fileName);

  if (isPdf(file)) {
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer);
    const text = data.text?.trim() ?? '';
    if (!text) {
      throw new Error('Could not extract text from scoring file');
    }
    return text;
  }

  if (isDocx(file)) {
    const mammoth = (await import('mammoth')).default;
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value?.trim() ?? '';
    if (!text) {
      throw new Error('Could not extract text from scoring file');
    }
    return text;
  }

  throw new Error('Unsupported scoring file type');
}
