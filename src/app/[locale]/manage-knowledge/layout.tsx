'use client';

import { DocumentsProvider } from '@/context/DocumentsContext';
import { Sidebar } from '../../components/Sidebar';
import { Toast } from '../../components/Toast';
import TabsWrapper from './TabsWrapper';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen flex flex-col">
      <Toast />
      <DocumentsProvider>
        <Sidebar>
          <div className="flex -mt-9 flex-col w-full h-full">
            <TabsWrapper />
            <div className="flex-grow">{children}</div>
          </div>
        </Sidebar>
      </DocumentsProvider>
    </div>
  );
}
