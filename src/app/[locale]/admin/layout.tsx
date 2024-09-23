import { Sidebar } from '../../components/Sidebar';

type Props = Readonly<{
  children: React.ReactNode;
}>;

export default function AdminLayout({ children }: Props) {
  return (
    <div className="h-screen flex flex-col">
      <Sidebar>{children}</Sidebar>
    </div>
  );
}
