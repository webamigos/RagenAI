import { fileTypeFromBuffer } from 'file-type';

/**
 * Determines if a file is plain text or binary
 * @param fileContent The file content as a Buffer
 * @returns true if the file is plain text, false if it's binary
 */
export const isPlainText = async (fileContent: Buffer): Promise<boolean> => {
  try {
    // Try to detect the file type using file-type library
    const fileType = await fileTypeFromBuffer(new Uint8Array(fileContent));

    // If file type is detected and it's a text-based format, return true
    if (
      fileType &&
      (fileType.mime.startsWith('text/') ||
        fileType.mime === 'application/json' ||
        fileType.mime === 'application/xml' ||
        fileType.mime === 'application/javascript' ||
        fileType.mime === 'application/x-httpd-php' ||
        fileType.mime === 'application/x-sh' ||
        fileType.mime === 'application/x-yaml' ||
        fileType.mime === 'application/x-www-form-urlencoded' ||
        fileType.mime === 'application/x-www-form-urlencoded; charset=UTF-8')
    ) {
      return true;
    }

    // If no file type is detected, try to decode as UTF-8
    // If it fails, it's likely binary
    try {
      const text = fileContent.toString('utf-8');
      // Check if the text contains control characters that are not common in text files
      const controlCharRegex = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/;
      return !controlCharRegex.test(text);
    } catch (e) {
      return false;
    }
  } catch (error) {
    // If any error occurs during detection, assume it's binary
    return false;
  }
};
