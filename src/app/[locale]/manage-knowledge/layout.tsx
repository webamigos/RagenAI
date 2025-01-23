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
          <div className="w-full h-full flex flex-col mt-8">
            <TabsWrapper />
            <div className="flex-grow mr-2">{children}</div>
          </div>
        </Sidebar>
      </DocumentsProvider>
    </div>
  );
}
