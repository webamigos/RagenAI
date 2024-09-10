type Props = {
  children: React.ReactNode;
};

export const Card = ({ children }: Props) => {
  return (
    <div className="max-w-sm w-screen p-6 bg-white border border-gray-200 rounded-lg shadow-lg dark:bg-gray-800 dark:border-gray-700 dark:shadow-slate-800	">
      {children}
    </div>
  );
};
