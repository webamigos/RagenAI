'use client';

import clsx from 'clsx';
import React, { forwardRef } from 'react';
import { ChevronRightIcon } from '@heroicons/react/20/solid';
import { Link } from '@/i18n/routing';

export function Breadcrumb({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'nav'>) {
  return (
    <nav
      {...props}
      aria-label="Breadcrumb"
      className={clsx(className, 'flex items-center space-x-1')}
    />
  );
}

export const BreadcrumbItem = forwardRef(function BreadcrumbItem(
  { className, children, ...props }: React.ComponentPropsWithoutRef<'div'>,
  ref: React.ForwardedRef<HTMLDivElement>,
) {
  return (
    <div
      {...props}
      ref={ref}
      className={clsx(
        className,
        'flex items-center text-sm font-medium text-muted-foreground',
      )}
    >
      {children}
    </div>
  );
});

export const BreadcrumbLink = forwardRef(function BreadcrumbLink(
  {
    className,
    children,
    current,
    href,
    ...props
  }: {
    current?: boolean;
    className?: string;
    children: React.ReactNode;
    href?: string;
  } & Omit<React.ComponentPropsWithoutRef<typeof Link>, 'href'>,
  ref: React.ForwardedRef<HTMLAnchorElement>,
) {
  const classes = clsx(
    'hover:text-foreground transition-colors duration-200',
    current
      ? 'text-foreground font-semibold cursor-default'
      : 'text-muted-foreground',
  );

  if (current) {
    return (
      <span className={clsx(className, classes)} aria-current="page">
        {children}
      </span>
    );
  }

  if (!href) {
    return <span className={clsx(className, classes)}>{children}</span>;
  }

  return (
    <Link {...props} href={href} className={clsx(className, classes)} ref={ref}>
      {children}
    </Link>
  );
});

export function BreadcrumbSeparator({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      {...props}
      className={clsx(className, 'flex items-center')}
      aria-hidden="true"
    >
      <ChevronRightIcon className="h-4 w-4 text-muted-foreground mx-2" />
    </div>
  );
}
