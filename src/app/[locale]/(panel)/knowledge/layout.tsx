import { ManageKnowledgeProviders } from './Providers';

export default async function KnowledgeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen flex flex-col px-4 pt-4 lg:px-6 lg:pt-6">
      <ManageKnowledgeProviders>
        <div className="grow">{children}</div>
      </ManageKnowledgeProviders>
    </div>
  );
}
