import { Toast } from '@/app/components/Toast';

type Props = {
  children: React.ReactNode;
};

export default function PublicLayout({ children }: Props) {
  return (
    <div className="h-full bg-primary-light dark:bg-primary-dark">
      <Toast />
      {children}
    </div>
  );
}
