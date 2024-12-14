import { Sidebar } from '../../components/Sidebar';
import { Toast } from '../../components/Toast';

type Props = Readonly<{
  children: React.ReactNode;
}>;

export default function MarketingLayout({ children }: Props) {
  return (
    <>
      <Toast />
      <div className="h-screen flex flex-col">
        <Sidebar>{children}</Sidebar>
      </div>
    </>
  );
}
