import clsx from 'clsx';
import React, { forwardRef } from 'react';

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  className?: string;
}

export const Container = forwardRef<HTMLDivElement, Props>(
  ({ children, title: _title, size = 'lg', className, ...rest }, ref) => {
    const sizeClass =
      {
        sm: 'max-w-sm w-full',
        md: 'max-w-md w-full',
        lg: 'max-w-lg w-full',
        xl: 'max-w-xl w-full',
        '2xl': 'max-w-2xl w-full',
        full: 'w-full',
      }[size] || 'max-w-md w-full';

    return (
      <div
        ref={ref}
        className={clsx(
          sizeClass,
          'space-y-4 bg-white  dark:bg-secondary-dark font-sans mx-auto',
          className,
        )}
        {...rest}
      >
        <div className="mt-2">{children}</div>
      </div>
    );
  },
);

Container.displayName = 'Container';
