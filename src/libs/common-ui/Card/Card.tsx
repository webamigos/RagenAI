import { Text } from '../Text';
import clsx from 'clsx';

type Props = {
  children: React.ReactNode;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'full';
  className?: string;
};

export const Card = ({ children, title, size = 'sm', className }: Props) => {
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
      default:
        return 'max-w-sm';
    }
  };

  return (
    <div
      className={clsx(
        sizeClass(),
        'w-screen p-6 bg-white border border-gray-200 rounded-lg shadow-lg dark:bg-gray-800 dark:border-gray-700',
        className
      )}
    >
      {title && (
        <Text className="mb-2" fontWeight="medium" fontSize="md">
          {title}
        </Text>
      )}
      {children}
    </div>
  );
};
