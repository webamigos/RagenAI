import { Text } from '../Text';
import clsx from 'clsx';
import React, { forwardRef } from 'react';

type Props = React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'full';
  className?: string;
};

export const Card = forwardRef<HTMLDivElement, Props>(
  ({ children, title, size = 'sm', className, ...rest }, ref) => {
    const sizeClass = () => {
      switch (size) {
        case 'sm':
          return 'max-w-sm w-full';
        case 'md':
          return 'max-w-md w-full';
        case 'lg':
          return 'max-w-lg w-full';
        case 'full':
          return 'w-full';
        default:
          return 'max-w-sm w-full';
      }
    };

    return (
      <div
        ref={ref}
        className={clsx(
          sizeClass(),
          'p-6 bg-white border border-gray-200 rounded-2xl shadow-lg dark:bg-secondary-dark dark:border-gray-700 font-sans',
          className
        )}
        {...rest}
      >
        {title && (
          <Text
            color="gray-700"
            className="mb-2 dark:text-gray-300"
            fontWeight="medium"
            fontSize="md"
          >
            {title}
          </Text>
        )}
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
