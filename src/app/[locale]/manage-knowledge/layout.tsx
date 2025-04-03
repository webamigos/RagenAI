'use client';

import { DocumentsProvider } from '@/context/DocumentsContext';
import { Sidebar } from '../../components/Sidebar';
import { Toast } from '../../components/Toast';
import TabsWrapper from './TabsWrapper';
import { getDefaultProjectPublicId } from '@/app/actions';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const defaultPublicProjectId = await getDefaultProjectPublicId();

  return (
    <div className="h-screen flex flex-col">
      <Toast />
      <DocumentsProvider>
        <Sidebar defaultPublicProjectId={defaultPublicProjectId}>
          <div className="w-full h-full flex flex-col mt-8">
            <TabsWrapper />
            <div className="flex-grow mr-2">{children}</div>
          </div>
        </Sidebar>
      </DocumentsProvider>
    </div>
  );
}
