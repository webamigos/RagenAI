import clsx from 'clsx';
import React from 'react';

import { Link } from '@/i18n/routing';

/**
 * Link-based pagination, written here rather than taken from a component kit.
 *
 * The kit's version built every control out of its own `Button` with a `plain`
 * prop and an `href` pass-through. Neither survives: `common-ui/Button` is
 * shadcn's now and deliberately dropped `href`, because a button that silently
 * became an anchor was the source of the confusion ADR-41 is unwinding. So the
 * controls here are anchors where they navigate and spans where they do not,
 * which is also what a screen reader should be told.
 *
 * The API is deliberately unchanged from the component it replaces, so the one
 * call site only swaps its import. Colours read the token layer.
 */

/** Shared shape for a control: a 36px-tall target with a focus ring. */
const controlBase =
  'relative inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm/6 font-semibold ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export function Pagination({
  'aria-label': ariaLabel = 'Page navigation',
  className,
  ...props
}: React.ComponentPropsWithoutRef<'nav'>) {
  return (
    <nav
      aria-label={ariaLabel}
      {...props}
      className={clsx(className, 'flex gap-x-2')}
    />
  );
}

function ArrowLeft() {
  return (
    <svg
      className="size-4 stroke-current"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.75 8H13.25M2.75 8L5.25 5.5M2.75 8L5.25 10.5"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg
      className="size-4 stroke-current"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M13.25 8L2.75 8M13.25 8L10.75 10.5M13.25 8L10.75 5.5"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * A step control. With no `href` there is nowhere to go, so it renders as
 * disabled text rather than a link — `aria-disabled` plus muted colour, which
 * keeps it announced but not actionable.
 */
function Step({
  href,
  label,
  className,
  children,
}: React.PropsWithChildren<{
  href: string | null;
  label: string;
  className?: string;
}>) {
  if (href === null) {
    return (
      <span
        aria-disabled="true"
        aria-label={label}
        className={clsx(
          controlBase,
          className,
          'cursor-default text-muted-foreground opacity-50',
        )}
      >
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={label}
      className={clsx(
        controlBase,
        className,
        'text-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      {children}
    </Link>
  );
}

export function PaginationPrevious({
  href = null,
  className,
  children = 'Previous',
}: React.PropsWithChildren<{ href?: string | null; className?: string }>) {
  return (
    <span className={clsx(className, 'grow basis-0')}>
      <Step href={href} label="Previous page">
        <ArrowLeft />
        {children}
      </Step>
    </span>
  );
}

export function PaginationNext({
  href = null,
  className,
  children = 'Next',
}: React.PropsWithChildren<{ href?: string | null; className?: string }>) {
  return (
    <span className={clsx(className, 'flex grow basis-0 justify-end')}>
      <Step href={href} label="Next page">
        {children}
        <ArrowRight />
      </Step>
    </span>
  );
}

export function PaginationList({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      {...props}
      className={clsx(className, 'hidden items-baseline gap-x-2 sm:flex')}
    />
  );
}

export function PaginationPage({
  href,
  className,
  current = false,
  children,
}: React.PropsWithChildren<{
  href: string;
  className?: string;
  current?: boolean;
}>) {
  return (
    <Link
      href={href}
      aria-label={`Page ${children}`}
      aria-current={current ? 'page' : undefined}
      className={clsx(
        controlBase,
        className,
        'min-w-9 text-foreground hover:bg-accent hover:text-accent-foreground',
        current && 'bg-accent text-accent-foreground',
      )}
    >
      <span className="-mx-0.5">{children}</span>
    </Link>
  );
}

export function PaginationGap({
  className,
  children = <>&hellip;</>,
  ...props
}: React.ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      aria-hidden="true"
      {...props}
      className={clsx(
        className,
        'w-9 text-center text-sm/6 font-semibold text-foreground select-none',
      )}
    >
      {children}
    </span>
  );
}
