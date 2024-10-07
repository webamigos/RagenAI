import { auth } from '@clerk/nextjs/server';

import { Sidebar } from '@/app/components/Sidebar';
import { Toast } from '@/app/components/Toast';

type Props = {
  children: React.ReactNode;
};

export default function MyProfileLayout({ children }: Props) {
  const { sessionClaims } = auth();
  const membership = sessionClaims?.membership;

  return (
    <div className="h-full">
      <Toast />
      <Sidebar membership={membership}>{children}</Sidebar>
    </div>
  );
}
