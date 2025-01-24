type SupportPageGridProps = {
  children: React.ReactNode;
};

export const SupportPageGrid = ({ children }: SupportPageGridProps) => {
  return (
    <div className="w-full h-full flex flex-col items-center justify-between">
      {children}
    </div>
  );
};
