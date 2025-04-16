import { useContext } from 'react';

import { FilesContext } from '@/context/FilesContext';

export const useUserFilesContext = () => {
  const context = useContext(FilesContext);
  if (!context) {
    throw new Error('useFiles must be used within a FilesProvider');
  }
  return context;
};
