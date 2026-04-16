'use client';

import React from 'react';
import clsx from 'clsx';
import { Button } from './button';

export type EmptyStateAction =
  | { label: string; onClick: (e?: React.MouseEvent) => void; href?: never }
  | { label: string; href: string; onClick?: never };

export type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actions?: EmptyStateAction[];
  className?: string;
};

export function EmptyState({
  icon,
  title,
  description,
  actions,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center text-center py-12',
        className,
      )}
    >
      {icon && (
        <div className="mb-4" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {title}
      </p>
      {description && (
        <p
          data-testid="empty-state-description"
          className="text-xs text-zinc-400 dark:text-zinc-500 mt-1"
        >
          {description}
        </p>
      )}
      {actions && actions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 justify-center">
          {actions.map((action, index) => {
            const isPrimary = index === 0;
            if (isPrimary) {
              return action.href ? (
                <Button key={action.label} href={action.href} color="dark/zinc">
                  {action.label}
                </Button>
              ) : (
                <Button
                  key={action.label}
                  type="button"
                  onClick={(e: React.MouseEvent) => action.onClick?.(e)}
                  color="dark/zinc"
                >
                  {action.label}
                </Button>
              );
            }
            return action.href ? (
              <Button key={action.label} href={action.href} outline>
                {action.label}
              </Button>
            ) : (
              <Button
                key={action.label}
                type="button"
                onClick={(e: React.MouseEvent) => action.onClick?.(e)}
                outline
              >
                {action.label}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
