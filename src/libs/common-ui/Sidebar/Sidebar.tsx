/* eslint-disable prefer-const */
'use client';

import { type ComponentPropsWithoutRef, forwardRef, useId } from 'react';
import { LayoutGroup, motion } from 'framer-motion';
import * as Headless from '@headlessui/react';
import clsx from 'clsx';

import { AnimatedArrow } from '../icons';
import { Link } from '../Link';

export function Sidebar({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'nav'>) {
  return (
    <nav
      {...props}
      className={clsx(className, 'flex h-full min-h-0 flex-col')}
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
      className={clsx(
        className,
        'flex flex-col w-full border-zinc-950/5 px-4 pt-4 pb-2 dark:border-white/5 [&>[data-slot=section]+[data-slot=section]]:mt-2.5'
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
      className={clsx(
        className,
        'flex flex-1 flex-col overflow-y-auto px-4 [&>[data-slot=section]+[data-slot=section]]:mt-8'
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
      className={clsx(
        className,
        'flex flex-col border-zinc-950/5 p-4 dark:border-white/5 [&>[data-slot=section]+[data-slot=section]]:mt-2.5'
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
        className={clsx(className, 'flex flex-col gap-0.5')}
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
      className={clsx(
        className,
        'my-4 border-t border-zinc-950/5 lg:-mx-4 dark:border-white/5'
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
      className={clsx(className, 'mt-8 flex-1')}
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
      className={clsx(
        className,
        'mb-1 px-2 text-xs/6 font-medium text-zinc-500 dark:text-zinc-400'
      )}
    />
  );
}

type SidebarItemProps = {
  current?: boolean;
  className?: string;
  hasIcon?: boolean;
  children: React.ReactNode;
} & (
  | Omit<Headless.ButtonProps, 'as' | 'className'>
  | Omit<ComponentPropsWithoutRef<typeof Link>, 'type' | 'className'>
);

export const SidebarItem = forwardRef(function SidebarItem(
  { current, className, children, hasIcon = false, ...props }: SidebarItemProps,
  ref: React.ForwardedRef<HTMLAnchorElement | HTMLButtonElement>
) {
  let classes = clsx(
    'flex w-full items-center gap-3 rounded-lg px-2 py-2.5 font-sans text-left text-base font-medium text-gray-600 dark:text-gray-400 md:py-2 text-sm',
    'hover:bg-primary-gray-200 dark:hover:bg-accent-dark-500',
    current && 'bg-zinc-950/5 text-blue-500',
    'group',
    className
  );

  return (
    <span className={clsx(className, 'relative')}>
      {current && (
        <motion.span
          layoutId="current-indicator"
          className="absolute inset-y-2 left-0.5 w-0.5 rounded-full bg-primary-blue-400 dark:bg-white"
        />
      )}
      {'href' in props ? (
        <Headless.CloseButton as="div" ref={ref}>
          <Link className={classes} {...props} data-current={current}>
            {children}
            <AnimatedArrow />
          </Link>
        </Headless.CloseButton>
      ) : (
        <Headless.Button
          {...props}
          className={clsx('cursor-pointer text-gray-400', classes)}
          data-current={current}
          ref={ref}
        >
          {children}
          {hasIcon && <AnimatedArrow />}
        </Headless.Button>
      )}
    </span>
  );
});

SidebarItem.displayName = 'SidebarItem';

export const SidebarLabel = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'span'>) => {
  return <span {...props} className={clsx('font-sans truncate', className)} />;
};

SidebarLabel.displayName = 'SidebarLabel';
