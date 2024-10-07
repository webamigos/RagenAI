import { Sidebar } from '@/app/components/Sidebar';
import { Toast } from '@/app/components/Toast';

type Props = {
  children: React.ReactNode;
};

export default function MyProfileLayout({ children }: Props) {
  return (
    <div className="h-full">
      <Toast />
      <Sidebar>{children}</Sidebar>
    </div>
  );
}
