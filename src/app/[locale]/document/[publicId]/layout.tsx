import { Sidebar } from '../../../components/Sidebar';
import { getDefaultProjectPublicId } from '@/app/actions';

type Props = Readonly<{
  children: React.ReactNode;
}>;

export default async function AdminLayout({ children }: Props) {
  const defaultPublicProjectId = await getDefaultProjectPublicId();

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar defaultPublicProjectId={defaultPublicProjectId}>
        {children}
      </Sidebar>
    </div>
  );
}
