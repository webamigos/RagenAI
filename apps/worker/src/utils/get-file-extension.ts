export const getFileExtension = (fileName: string) => {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0) return '';
  return fileName.slice(dotIndex + 1);
};
