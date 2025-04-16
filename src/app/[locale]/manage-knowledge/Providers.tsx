'use client';

import { FilesProvider } from '@/context/FilesContext';

type Props = {
  children: React.ReactNode;
};

export const ManageKnowledgeProviders = ({ children }: Props) => {
  return (
    <FilesProvider>
      <div className="flex-grow mr-2">{children}</div>
    </FilesProvider>
  );
};
