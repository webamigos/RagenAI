import TabsWrapper from './TabsWrapper';
import { getDefaultProjectPublicId } from '@/app/actions';
import { ManageKnowledgeProviders } from './Providers';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const defaultPublicProjectId = await getDefaultProjectPublicId();

  return (
    <div className="h-screen flex flex-col gap-6 px-4 pt-4 lg:px-6 lg:pt-6">
      <TabsWrapper />
      <ManageKnowledgeProviders>
        <div className="grow">{children}</div>
      </ManageKnowledgeProviders>
    </div>
  );
}
