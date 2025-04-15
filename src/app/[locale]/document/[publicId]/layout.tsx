'use client';

import { DocumentsProvider } from '@/context/DocumentsContext';
import { Sidebar } from '../../../components/Sidebar';
import { Toast } from '../../../components/Toast';
import { getDefaultProjectPublicId } from '@/app/actions';

type Props = Readonly<{
  children: React.ReactNode;
}>;

export default async function AdminLayout({ children }: Props) {
  const defaultPublicProjectId = await getDefaultProjectPublicId();

  return (
    <div className="h-screen flex overflow-hidden">
      <Toast />
      <DocumentsProvider>
        <Sidebar defaultPublicProjectId={defaultPublicProjectId}>
          {children}
        </Sidebar>
      </DocumentsProvider>
    </div>
  );
}
