'use client';

import { type ComponentPropsWithoutRef, forwardRef, useId } from 'react';
import { LayoutGroup, motion } from 'framer-motion';

import { classMerge } from '../utils/cn';
import { AnimatedArrow } from '../icons';
import { Link } from '../Link';

export function Sidebar({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'nav'>) {
  return (
    <nav
      {...props}
      className={classMerge('flex h-full min-h-0 flex-col', className)}
    />
  );
}

export function SidebarHeader({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      {...props}
      className={classMerge(
        'flex flex-col w-full border-zinc-950/5 px-4 pt-4 pb-2 dark:border-white/5 [&>[data-slot=section]+[data-slot=section]]:mt-2.5',
        className
      )}
    />
  );
}

export function SidebarBody({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      {...props}
      className={classMerge(
        'flex flex-1 flex-col overflow-y-auto px-4 [&>[data-slot=section]+[data-slot=section]]:mt-8',
        className
      )}
    />
  );
}

export function SidebarFooter({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      {...props}
      className={classMerge(
        'flex flex-col border-zinc-950/5 p-4 dark:border-white/5 [&>[data-slot=section]+[data-slot=section]]:mt-2.5',
        className
      )}
    />
  );
}

export function SidebarSection({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  let id = useId();

  return (
    <LayoutGroup id={id}>
      <div
        {...props}
        data-slot="section"
        className={classMerge('flex flex-col gap-0.5', className)}
      />
    </LayoutGroup>
  );
}

export function SidebarDivider({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'hr'>) {
  return (
    <hr
      {...props}
      className={classMerge(
        'my-4 border-t border-zinc-950/5 lg:-mx-4 dark:border-white/5',
        className
      )}
    />
  );
}

export function SidebarSpacer({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      aria-hidden="true"
      {...props}
      className={classMerge('mt-8 flex-1', className)}
    />
  );
}

export function SidebarHeading({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'h3'>) {
  return (
    <h3
      {...props}
      className={classMerge(
        'mb-1 px-2 text-xs/6 font-medium text-zinc-500 dark:text-zinc-400',
        className
      )}
    />
  );
}

type SidebarItemProps = ComponentPropsWithoutRef<'a'> & {
  current?: boolean;
  className?: string;
  hasIcon?: boolean;
  disabled?: boolean;
  href?: string;
};

export const SidebarItem = forwardRef<HTMLAnchorElement, SidebarItemProps>(
  function SidebarItem(
    {
      current,
      className,
      children,
      hasIcon = false,
      disabled = false,
      href,
      ...props
    },
    ref
  ) {
    if (!href) {
      return null;
    }

    const classes = classMerge(
      'flex w-full items-center gap-3 mb-0.5 px-2 py-2.5 font-sans text-left text-base font-medium text-gray-600 dark:text-gray-400 md:py-2 text-sm rounded-lg',
      'hover:bg-primary-gray-200 dark:hover:bg-accent-dark-500',
      current && 'bg-zinc-950/5 text-blue-500',
      disabled && 'opacity-50 cursor-not-allowed pointer-events-none',
      'group',
      className
    );

    return (
      <span className={classMerge('relative', className)}>
        {current && (
          <motion.span
            layoutId="current-indicator"
            className="absolute inset-y-2 left-0.5 w-0.5 rounded-full bg-primary-blue-400 dark:bg-white"
          />
        )}
        <Link
          ref={ref}
          className={classes}
          aria-disabled={disabled}
          href={href}
          {...props}
        >
          {children}
          {hasIcon && <AnimatedArrow />}
        </Link>
      </span>
    );
  }
);

SidebarItem.displayName = 'SidebarItem';

export const SidebarLabel = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'span'>) => {
  return (
    <span {...props} className={classMerge('font-sans truncate', className)} />
  );
};

SidebarLabel.displayName = 'SidebarLabel';
