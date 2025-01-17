import { parseSrtToSegmentsUsingLLM } from '@/app/api/threads/services/parseSrtWithLLM';

export type ParsedFile = {
  content: string | Buffer;
  fileName: string;
  fileType: string;
};

export async function parseFile(
  file: File,
  organizationId: string
): Promise<ParsedFile> {
  if (!file.size) {
    throw new Error(`The file ${file.name} is empty`);
  }

  const fileType = getFileType(file.name);

  if (fileType === 'srt') {
    const fileText = await file.text();
    const segments = await parseSrtToSegmentsUsingLLM(
      organizationId,
      fileText,
      200,
      300
    );
    return { content: segments.join('\n\n'), fileName: file.name, fileType };
  }

  if (fileType === 'epub') {
    const buffer = Buffer.from(await file.arrayBuffer());
    return { content: buffer, fileName: file.name, fileType };
  }

  if (fileType === 'text') {
    const content = await file.text();
    return { content, fileName: file.name, fileType };
  }

  throw new Error(`Unsupported file type: ${file.name}`);
}

function getFileType(fileName: string): string {
  if (fileName.endsWith('.srt')) return 'srt';
  if (fileName.endsWith('.epub')) return 'epub';
  if (fileName.endsWith('.md') || fileName.endsWith('.txt')) return 'text';
  return 'unknown';
}
