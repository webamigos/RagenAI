'use client';

import React from 'react';
import clsx from 'clsx';

import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';

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
          {/*
            The first action is the primary one and gets the filled treatment;
            the rest are outlines.

            A navigating action renders `<Button asChild>` around a `Link`
            rather than passing it an `href`. The component this replaced took
            an `href` and quietly became an anchor, which is the confusion
            ADR-41 is unwinding — `common-ui/Button` dropped that prop in #928
            for the same reason. `asChild` keeps the styling and the semantics
            separate: shadcn's variants on a real link.
          */}
          {actions.map((action, index) => {
            const variant = index === 0 ? 'default' : 'outline';

            return action.href ? (
              <Button key={action.label} variant={variant} asChild>
                <Link href={action.href}>{action.label}</Link>
              </Button>
            ) : (
              <Button
                key={action.label}
                variant={variant}
                type="button"
                onClick={(e: React.MouseEvent) => action.onClick?.(e)}
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
