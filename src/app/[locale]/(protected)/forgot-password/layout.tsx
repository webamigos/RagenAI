type Props = {
  readonly children: React.ReactNode;
};

export default function ProtectedLayout({ children }: Props) {
  return (
    <div className="h-screen w-screen flex justify-center items-center">
      {children}
    </div>
  );
}
