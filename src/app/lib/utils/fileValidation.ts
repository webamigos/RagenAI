/**
 * Utility functions for file validation
 */

/**
 * Checks if a file is of a supported type
 */
export const isSupportedFile = (file: File): boolean => {
  return (
    file.type === 'text/markdown' ||
    file.type === 'application/epub+zip' ||
    file.name.endsWith('.md') ||
    file.name.endsWith('.epub') ||
    file.name.endsWith('.pdf') ||
    file.name.endsWith('.srt')
  );
};

/**
 * Checks if a file is a text file (for textarea attachments)
 */
export const isTextFile = (file: File): boolean => {
  return (
    file.type === 'text/markdown' ||
    file.type === 'text/plain' ||
    file.name.endsWith('.md') ||
    file.name.endsWith('.srt') ||
    file.name.endsWith('.txt')
  );
};

/**
 * Validates file size (max 1MB for textarea attachments)
 */
export const isValidFileSize = (file: File, maxSizeMB: number = 1): boolean => {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  return file.size <= maxSizeBytes;
};

/**
 * Comprehensive validation for textarea file attachments
 */
export const validateTextFile = (
  file: File
): { valid: boolean; error?: string } => {
  if (!isTextFile(file)) {
    return {
      valid: false,
      error: `File type not supported. Only .md, .srt, and .txt files are allowed.`,
    };
  }

  if (!isValidFileSize(file)) {
    return {
      valid: false,
      error: `File too large. Maximum size is 1MB.`,
    };
  }

  return { valid: true };
};

/**
 * Processes file for proper MIME type
 */
export const processFileType = (file: File): File => {
  // Handle markdown files with either .md extension or application/octet-stream MIME type
  if (
    file.name.endsWith('.md') ||
    (file.type === 'application/octet-stream' && file.name.endsWith('.md'))
  ) {
    return new File([file], file.name, { type: 'text/markdown' });
  }
  if (file.name.endsWith('.srt')) {
    return new File([file], file.name, { type: 'application/x-subrip' });
  }
  if (file.name.endsWith('.txt')) {
    return new File([file], file.name, { type: 'text/plain' });
  }
  return file;
};
