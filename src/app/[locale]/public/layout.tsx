type Props = {
  children: React.ReactNode;
};

export default function PublicLayout({ children }: Props) {
  return (
    <div className="h-full bg-primary-light dark:bg-primary-dark">
      {children}
    </div>
  );
}
