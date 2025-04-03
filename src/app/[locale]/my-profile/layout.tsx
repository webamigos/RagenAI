import { auth } from '@clerk/nextjs/server';

import { Sidebar } from '@/app/components/Sidebar';
import { Toast } from '@/app/components/Toast';
import { getDefaultProjectPublicId } from '@/app/actions';

type Props = {
  children: React.ReactNode;
};

export default async function MyProfileLayout({ children }: Props) {
  const { sessionClaims } = auth();
  const membership = sessionClaims?.membership;
  const defaultPublicProjectId = await getDefaultProjectPublicId();

  return (
    <div className="h-full">
      <Toast />
      <Sidebar
        membership={membership}
        defaultPublicProjectId={defaultPublicProjectId}
      >
        {children}
      </Sidebar>
    </div>
  );
}
