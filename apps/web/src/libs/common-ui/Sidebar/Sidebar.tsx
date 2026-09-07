'use client';

import clsx from 'clsx';
import { LayoutGroup, motion } from 'framer-motion';
import React, { forwardRef, useId } from 'react';

import { Link } from '@/i18n/routing';
import { useMobileSidebar } from '../SidebarLayout';

/**
 * The sidebar primitives, written here rather than taken from a component kit.
 *
 * Two things this replaces, and both were doing work the names did not admit
 * to:
 *
 * **Headless UI's `CloseButton`.** A `SidebarItem` with an `href` used to be a
 * `CloseButton as={Link}`, which is how the mobile drawer closed when you
 * navigated. Nothing said so. It is `closeSidebar()` on click now — the same
 * mechanism `ChatButton` and `SearchButton` already call explicitly, so the
 * behaviour is stated in one way instead of two.
 *
 * **`data-hover` and `data-active`.** Those attributes came from Headless UI's
 * button, so plain elements never receive them and the styles would have gone
 * quietly dead. They are `hover:` and `active:` variants here.
 *
 * `TouchTarget` is reproduced rather than dropped: it widens the tap area to
 * 2.75rem on a coarse pointer, which is worth keeping and is ten lines.
 *
 * Colours read the tokens. This file was deliberately skipped when the palette
 * landed, because it was about to be replaced — so it is the last part of the
 * sidebar still naming greys, and that ends here.
 *
 * framer-motion stays. It is an ordinary dependency of this app, and the
 * sliding current-page indicator is the one piece of motion in the panel that
 * answers a navigation rather than decorating one.
 */

/** Widens the hit area on touch devices without changing the visual box. */
function TouchTarget({ children }: { children: React.ReactNode }) {
  return (
    <>
      <span
        className="absolute top-1/2 left-1/2 size-[max(100%,2.75rem)] -translate-x-1/2 -translate-y-1/2 [@media(pointer:fine)]:hidden"
        aria-hidden="true"
      />
      {children}
    </>
  );
}

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
        'flex flex-col border-b border-sidebar-border p-4 [&>[data-slot=section]+[data-slot=section]]:mt-2.5',
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
        'flex flex-1 flex-col overflow-y-auto p-4 [&>[data-slot=section]+[data-slot=section]]:mt-8',
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
        'flex flex-col border-t border-sidebar-border p-4 [&>[data-slot=section]+[data-slot=section]]:mt-2.5',
      )}
    />
  );
}

/**
 * The LayoutGroup is not decoration: it scopes `layoutId="current-indicator"`
 * to this section, so the marker slides between items within one group instead
 * of flying across the whole sidebar between unrelated lists.
 */
export function SidebarSection({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  const id = useId();

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
        'my-4 border-t border-sidebar-border lg:-mx-4',
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
        'mb-1 px-2 text-xs/6 font-medium text-muted-foreground',
      )}
    />
  );
}

const itemClasses = clsx(
  'flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-base/6 font-medium text-sidebar-foreground sm:py-1 sm:text-sm/5',
  // Leading icon, or an icon on its own
  'data-[slot=icon]:*:size-6 data-[slot=icon]:*:shrink-0 data-[slot=icon]:*:fill-muted-foreground sm:data-[slot=icon]:*:size-5',
  // Trailing icon — a chevron or similar
  'data-[slot=icon]:last:*:ml-auto data-[slot=icon]:last:*:size-5 sm:data-[slot=icon]:last:*:size-4',
  'data-[slot=avatar]:*:-m-0.5 data-[slot=avatar]:*:size-7 sm:data-[slot=avatar]:*:size-6',
  // `hover:`/`active:`, not `data-hover:`/`data-active:` — those came from the
  // kit's button and no plain element sets them.
  'hover:bg-sidebar-accent data-[slot=icon]:*:hover:fill-sidebar-foreground',
  'active:bg-sidebar-accent data-[slot=icon]:*:active:fill-sidebar-foreground',
  'data-[slot=icon]:*:data-current:fill-sidebar-foreground',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
);

type SidebarItemBaseProps = {
  current?: boolean;
  className?: string;
  children: React.ReactNode;
};

type SidebarItemProps = SidebarItemBaseProps &
  (
    | ({ href: string } & Omit<
        React.ComponentPropsWithoutRef<typeof Link>,
        'href' | 'className' | 'children'
      >)
    | ({ href?: never } & Omit<
        React.ComponentPropsWithoutRef<'button'>,
        'className' | 'children'
      >)
  );

export const SidebarItem = forwardRef(function SidebarItem(
  { current, className, children, ...props }: SidebarItemProps,
  ref: React.ForwardedRef<HTMLAnchorElement | HTMLButtonElement>,
) {
  const { closeSidebar } = useMobileSidebar();

  return (
    <span className={clsx(className, 'relative')}>
      {current && (
        <motion.span
          layoutId="current-indicator"
          className="absolute inset-y-2 -left-4 w-0.5 rounded-full bg-sidebar-primary"
        />
      )}
      {'href' in props && props.href !== undefined ? (
        <Link
          {...props}
          href={props.href}
          className={itemClasses}
          data-current={current ? 'true' : undefined}
          ref={ref as React.ForwardedRef<HTMLAnchorElement>}
          onClick={(event) => {
            // Closing the mobile drawer on navigation used to be a side effect
            // of the kit's CloseButton. Stated here instead.
            closeSidebar();
            props.onClick?.(event);
          }}
        >
          <TouchTarget>{children}</TouchTarget>
        </Link>
      ) : (
        <button
          type="button"
          {...(props as React.ComponentPropsWithoutRef<'button'>)}
          className={clsx('cursor-default', itemClasses)}
          data-current={current ? 'true' : undefined}
          ref={ref as React.ForwardedRef<HTMLButtonElement>}
        >
          <TouchTarget>{children}</TouchTarget>
        </button>
      )}
    </span>
  );
});

export function SidebarLabel({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'span'>) {
  return <span {...props} className={clsx(className, 'truncate')} />;
}
