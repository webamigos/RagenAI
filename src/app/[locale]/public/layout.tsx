import { Toast } from '@/app/components/Toast';

type Props = {
  children: React.ReactNode;
};

export default function PublicLayout({ children }: Props) {
  return (
    <div className="h-full">
      <Toast />
      <main>
        <header className="mb-4 flex gap-2 flex-col h-full">
          {/* <div className="w-full bg-red-200 p-4 text-red-700 text-center font-medium">
            Warning this is danger POC code!!
          </div> */}
        </header>
        <div className="container mx-auto h-full mt-4">{children}</div>
      </main>
    </div>
  );
}
