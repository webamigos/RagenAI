'use client';

import { DocumentsProvider } from '@/context/DocumentsContext';
import { Sidebar } from '../../components/Sidebar';
import { Toast } from '../../components/Toast';

import CreateDocumentPage from './create-document/page';
import UploadedListPage from './documents-list/page';
import AddFilesPage from './upload-files/page';

export default function AdminLayout({ children }: Props) {
  return (
    <div className="h-screen flex flex-col">
      <Toast />
      <DocumentsProvider>
        <Sidebar>{children}</Sidebar>
      </DocumentsProvider>
    </div>
  );
};

export default ManageKnowledgeLayout;
