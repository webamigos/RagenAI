import { Sidebar } from '@/app/components/Sidebar';

type Props = {
  children: React.ReactNode;
};

export default function MyProfileLayout({ children }: Props) {
  return (
    <div className="h-full">
      <Sidebar>{children} </Sidebar>
    </div>
  );
}
