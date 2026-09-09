type Props = {
  children: React.ReactNode;
};

export default function PublicLayout({ children }: Props) {
  return <div className="min-h-full bg-background">{children}</div>;
}
