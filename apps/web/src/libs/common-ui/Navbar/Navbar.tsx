'use client';

import clsx from 'clsx';
import { LayoutGroup, motion } from 'framer-motion';
import React, { forwardRef, useId } from 'react';

import { Link } from '@/i18n/routing';
import { TouchTarget } from '../TouchTarget';

/**
 * The navbar primitives, written here rather than taken from a component kit —
 * the same move the sidebar primitives made, and the last one the kit's
 * `navbar` was holding up.
 *
 * Two things this fixes rather than ports:
 *
 * **`data-hover` and `data-active` were dead on every link.** Those attributes
 * are set by Headless UI's `Button`, so the anchor branch — which renders
 * next-intl's `Link`, a plain `<a>` — never received them. Every hover and
 * active rule on a navigating `NavbarItem` was inert, which is why hovering
 * one did nothing while hovering a button-flavoured one did. They are `hover:`
 * and `active:` variants now, so both branches behave the same.
 *
 * **No focus ring.** Headless UI's button contributed its own focus styling;
 * an anchor gets whatever the page gives it, which here was nothing. Both
 * branches carry an explicit `focus-visible` ring on the token colour.
 *
 * Colours read the token layer. The kit's version named zinc and white
 * directly, so it sat outside the one-colour-system work entirely.
 *
 * framer-motion stays, for the same reason as in the sidebar: the sliding
 * current-page indicator answers a navigation rather than decorating one.
 */

export function Navbar({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'nav'>) {
  return (
    <nav
      {...props}
      className={clsx(className, 'flex flex-1 items-center gap-4 py-2.5')}
    />
  );
}

export function NavbarDivider({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      aria-hidden="true"
      {...props}
      className={clsx(className, 'h-6 w-px bg-border')}
    />
  );
}

export function NavbarSection({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  // Scopes the shared `layoutId` below, so two sections on one page animate
  // their own indicator instead of fighting over a single one.
  const id = useId();

  return (
    <LayoutGroup id={id}>
      <div {...props} className={clsx(className, 'flex items-center gap-3')} />
    </LayoutGroup>
  );
}

export function NavbarSpacer({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      aria-hidden="true"
      {...props}
      className={clsx(className, '-ml-4 flex-1')}
    />
  );
}

export function NavbarLabel({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'span'>) {
  return <span {...props} className={clsx(className, 'truncate')} />;
}

type NavbarItemProps = {
  current?: boolean;
  className?: string;
  children: React.ReactNode;
} & (
  | Omit<React.ComponentPropsWithoutRef<'button'>, 'className'>
  | Omit<React.ComponentPropsWithoutRef<typeof Link>, 'className'>
);

export const NavbarItem = forwardRef(function NavbarItem(
  { current, className, children, ...props }: NavbarItemProps,
  ref: React.ForwardedRef<HTMLAnchorElement | HTMLButtonElement>,
) {
  const classes = clsx(
    // Base
    'relative flex min-w-0 items-center gap-3 rounded-lg p-2 text-left text-base/6 font-medium text-foreground sm:text-sm/5',
    // Leading icon / icon-only
    '*:data-[slot=icon]:size-6 *:data-[slot=icon]:shrink-0 *:data-[slot=icon]:text-muted-foreground sm:*:data-[slot=icon]:size-5',
    // Trailing icon (a chevron or similar)
    '*:data-[slot=icon]:last:not-nth-2:ml-auto *:data-[slot=icon]:last:not-nth-2:size-5 sm:*:data-[slot=icon]:last:not-nth-2:size-4',
    // Avatar
    '*:data-[slot=avatar]:-m-0.5 *:data-[slot=avatar]:size-7 *:data-[slot=avatar]:[--avatar-radius:var(--radius-md)] sm:*:data-[slot=avatar]:size-6',
    // Hover and active — real CSS states, so they apply to the anchor too
    'hover:bg-accent hover:text-accent-foreground hover:*:data-[slot=icon]:text-accent-foreground',
    'active:bg-accent active:*:data-[slot=icon]:text-accent-foreground',
    // Focus
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
  );

  return (
    <span className={clsx(className, 'relative')}>
      {current && (
        <motion.span
          layoutId="current-indicator"
          className="absolute inset-x-2 -bottom-2.5 h-0.5 rounded-full bg-foreground"
        />
      )}
      {'href' in props ? (
        <Link
          {...(props as React.ComponentPropsWithoutRef<typeof Link>)}
          className={classes}
          data-current={current ? 'true' : undefined}
          ref={ref as React.ForwardedRef<HTMLAnchorElement>}
        >
          <TouchTarget>{children}</TouchTarget>
        </Link>
      ) : (
        <button
          type="button"
          {...(props as React.ComponentPropsWithoutRef<'button'>)}
          className={clsx('cursor-default', classes)}
          data-current={current ? 'true' : undefined}
          ref={ref as React.ForwardedRef<HTMLButtonElement>}
        >
          <TouchTarget>{children}</TouchTarget>
        </button>
      )}
    </span>
  );
});
