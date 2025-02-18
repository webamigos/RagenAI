'use client';

import { Text } from '../Text';
import clsx from 'clsx';
import React, { forwardRef, useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { Collapse } from '../Collapse';

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'full';
  className?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

export const Card = forwardRef<HTMLDivElement, Props>(
  (
    {
      children,
      title,
      size = 'sm',
      className,
      collapsible = false,
      defaultCollapsed = false,
      ...rest
    },
    ref
  ) => {
    const [collapsed, setCollapsed] = useState(defaultCollapsed);

    const sizeClass =
      {
        sm: 'max-w-sm w-full',
        md: 'max-w-md w-full',
        lg: 'max-w-lg w-full',
        full: 'w-full',
      }[size] || 'max-w-sm w-full';

    return (
      <div
        ref={ref}
        className={clsx(
          sizeClass,
          'p-6 bg-white border border-gray-200 rounded-lg shadow-lg dark:bg-secondary-dark dark:border-gray-700 font-sans',
          className
        )}
        {...rest}
      >
        {(title || collapsible) && (
          <div className="flex justify-between items-center mb-2">
            {title && (
              <Text
                color="gray-700"
                className="dark:text-gray-300"
                fontWeight="medium"
                fontSize="md"
              >
                {title}
              </Text>
            )}
            {collapsible && (
              <button
                onClick={() => setCollapsed((prev) => !prev)}
                className="ml-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none"
                aria-label={collapsed ? 'Expand card' : 'Collapse card'}
              >
                {collapsed ? (
                  <ChevronDownIcon className="h-5 w-5" />
                ) : (
                  <ChevronUpIcon className="w-5 h-5" />
                )}
              </button>
            )}
          </div>
        )}

        {collapsible ? (
          <Collapse isOpen={!collapsed}>
            <div className="mt-2">{children}</div>
          </Collapse>
        ) : (
          <div className="mt-2">{children}</div>
        )}
      </div>
    );
  }
);

Card.displayName = 'Card';
