'use client';

import { DocumentsProvider } from '@/context/DocumentsContext';
import { Sidebar } from '../../components/Sidebar';
import { Toast } from '../../components/Toast';

type Props = Readonly<{
  children: React.ReactNode;
}>;

export default function AdminLayout({ children }: Props) {
  return (
    <div className="h-screen flex flex-col">
      <Toast />
      <DocumentsProvider>
        <Sidebar>{children}</Sidebar>
      </DocumentsProvider>
    </div>
  );
}
