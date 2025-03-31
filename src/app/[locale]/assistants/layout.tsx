import { Sidebar } from '@/app/components/Sidebar/Sidebar';

export default function ProjectThreadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen">
      <Sidebar>{children}</Sidebar>
    </div>
  );
}
