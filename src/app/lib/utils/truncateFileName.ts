export const truncateFileName = (fileName: string, maxLength: number) => {
  if (fileName.length > maxLength) {
    return fileName.slice(0, maxLength) + '...';
  }
  return fileName;
};
