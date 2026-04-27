import { ManageKnowledgeProviders } from './Providers';

export default async function KnowledgeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ManageKnowledgeProviders>{children}</ManageKnowledgeProviders>;
}
