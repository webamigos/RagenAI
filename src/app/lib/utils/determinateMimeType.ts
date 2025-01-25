import { fileTypeFromBuffer } from 'file-type';

export const determineMimeType = async (
  fileContent: string | Buffer
): Promise<string | null> => {
  let mimeType: string | null = null;

  if (fileContent instanceof Buffer) {
    const fileType = await fileTypeFromBuffer(new Uint8Array(fileContent));
    mimeType = fileType?.mime || null;
  } else if (typeof fileContent === 'string') {
    if (fileContent.trim().startsWith('sep=') || fileContent.includes(',')) {
      mimeType = 'text/csv';
    } else {
      mimeType = 'text/markdown';
    }
  }

  return mimeType;
};
