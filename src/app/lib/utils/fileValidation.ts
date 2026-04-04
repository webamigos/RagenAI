/**
 * Utility functions for file validation
 */

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const XLSX_EXTENSIONS = ['.xlsx', '.xls'];
const BINARY_DOC_EXTENSIONS = ['.pdf', '.epub', '.docx'];

/**
 * Checks if a file is an image
 */
export const isXlsxFile = (file: File): boolean => {
  return XLSX_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));
};

export const isBinaryDocFile = (file: File): boolean => {
  return BINARY_DOC_EXTENSIONS.some((ext) =>
    file.name.toLowerCase().endsWith(ext),
  );
};

export const isImageFile = (file: File): boolean => {
  return (
    file.type.startsWith('image/') ||
    IMAGE_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))
  );
};

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
    file.name.endsWith('.srt') ||
    isImageFile(file) ||
    file.name.endsWith('.csv') ||
    file.name.endsWith('.xlsx') ||
    file.name.endsWith('.xls') ||
    file.name.endsWith('.docx')
  );
};

/**
 * Checks if a file is a text file (for textarea attachments)
 */
export const isTextFile = (file: File): boolean => {
  return (
    file.type === 'text/markdown' ||
    file.type === 'text/plain' ||
    file.type === 'text/csv' ||
    file.name.endsWith('.md') ||
    file.name.endsWith('.srt') ||
    file.name.endsWith('.txt') ||
    file.name.endsWith('.csv')
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
  file: File,
): { valid: boolean; error?: string } => {
  if (!isTextFile(file)) {
    return {
      valid: false,
      error: `File type not supported. Only .md, .srt, .txt, and .csv files are allowed.`,
    };
  }

  const maxSizeMB = file.name.endsWith('.csv') ? 5 : 1;
  if (!isValidFileSize(file, maxSizeMB)) {
    return {
      valid: false,
      error: `File too large. Maximum size is ${maxSizeMB}MB.`,
    };
  }

  return { valid: true };
};

/**
 * Validates an image file for chat attachment (max 5MB)
 */
export const validateImageFile = (
  file: File,
): { valid: boolean; error?: string } => {
  if (!isImageFile(file)) {
    return {
      valid: false,
      error: `File type not supported. Only .jpg, .png, .webp, and .gif images are allowed.`,
    };
  }

  if (!isValidFileSize(file, 5)) {
    return {
      valid: false,
      error: `Image too large. Maximum size is 5MB.`,
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
