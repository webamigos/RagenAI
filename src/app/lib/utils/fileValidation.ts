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
  return file;
};
