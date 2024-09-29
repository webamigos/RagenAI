import { Text } from '../Text';

type Props = {
  children: React.ReactNode;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'full';
};

export const Card = ({ children, title, size = 'sm' }: Props) => {
  const sizeClass = () => {
    switch (size) {
      case 'sm':
        return 'max-w-sm';
      case 'md':
        return 'max-w-md';
      case 'lg':
        return 'max-w-lg';
      case 'full':
        return 'max-w-screen-lg';
    }
  };

  return (
    <div
      className={`${sizeClass()} w-screen p-6 bg-white border border-gray-200 rounded-lg shadow-lg dark:bg-gray-800 dark:border-gray-700 dark:shadow-slate-800`}
    >
      <Text className="mb-2" fontWeight="medium" fontSize="md">
        {title as string}
      </Text>
      {children}
    </div>
  );
};
