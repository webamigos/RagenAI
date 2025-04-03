import { getDefaultProjectPublicId } from '@/app/actions';
import { Sidebar } from '@/app/components/Sidebar/Sidebar';

export default async function ProjectThreadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const defaultPublicProjectId = await getDefaultProjectPublicId();

  return (
    <div className="flex h-screen">
      <Sidebar defaultPublicProjectId={defaultPublicProjectId}>
        {children}
      </Sidebar>
    </div>
  );
}
