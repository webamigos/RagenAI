import { Sidebar } from '../../components/Sidebar';
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
    <div className="h-screen flex flex-col">
      <Sidebar defaultPublicProjectId={defaultPublicProjectId}>
        <div className="w-full h-full flex flex-col mt-8">
          <TabsWrapper />
          <ManageKnowledgeProviders>
            <div className="grow mr-2">{children}</div>
          </ManageKnowledgeProviders>
        </div>
      </Sidebar>
    </div>
  );
}
