export const getFileLabel = (filename: string): string => {
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex !== -1) {
    const ext = filename.slice(dotIndex + 1).toUpperCase();
    if (ext) {
      return ext;
    }
  }
  return 'DOC';
};
