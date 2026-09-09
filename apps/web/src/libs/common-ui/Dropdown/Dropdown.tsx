'use client';

import {
  Description as HeadlessDescription,
  type DescriptionProps as HeadlessDescriptionProps,
  Label as HeadlessLabel,
  type LabelProps as HeadlessLabelProps,
  Menu as HeadlessMenu,
  MenuButton as HeadlessMenuButton,
  type MenuButtonProps as HeadlessMenuButtonProps,
  MenuHeading as HeadlessMenuHeading,
  type MenuHeadingProps as HeadlessMenuHeadingProps,
  MenuItem as HeadlessMenuItem,
  MenuItems as HeadlessMenuItems,
  type MenuItemsProps as HeadlessMenuItemsProps,
  type MenuProps as HeadlessMenuProps,
  MenuSection as HeadlessMenuSection,
  type MenuSectionProps as HeadlessMenuSectionProps,
  MenuSeparator as HeadlessMenuSeparator,
  type MenuSeparatorProps as HeadlessMenuSeparatorProps,
} from '@headlessui/react';
import clsx from 'clsx';
import React from 'react';

import { type Button } from '../Button';
import { Link } from '../Link';

export function Dropdown(props: HeadlessMenuProps) {
  return <HeadlessMenu {...props} />;
}

export function DropdownButton<T extends React.ElementType = typeof Button>({
  label,
  children,
  ...props
}: { className?: string; label?: string } & Omit<
  HeadlessMenuButtonProps<T>,
  'className'
>) {
  return (
    <HeadlessMenuButton aria-label={label || 'Dropdown menu'} {...props}>
      {children}
    </HeadlessMenuButton>
  );
}

export function DropdownMenu({
  anchor = 'bottom',
  className,
  ...props
}: { className?: string } & Omit<HeadlessMenuItemsProps, 'as' | 'className'>) {
  return (
    <HeadlessMenuItems
      {...props}
      transition
      anchor={anchor}
      className={clsx(
        className,
        // Anchor positioning
        '[--anchor-gap:--spacing(2)] [--anchor-padding:--spacing(1)] data-[anchor~=start]:[--anchor-offset:-6px] data-[anchor~=end]:[--anchor-offset:6px] sm:data-[anchor~=start]:[--anchor-offset:-4px] sm:data-[anchor~=end]:[--anchor-offset:4px]',
        // Base styles
        'isolate w-max rounded-xl p-1',
        // Removed the outline-related classes
        // Handle scrolling when menu won't fit in viewport
        'overflow-y-auto',
        // Popover background
        'bg-white/75 backdrop-blur-xl dark:bg-paper-800',
        // Shadows
        'shadow-2xl dark:ring-inset dark:ring-white/10',
        // Define grid at the menu level if subgrid is supported
        'supports-[grid-template-columns:subgrid]:grid supports-[grid-template-columns:subgrid]:grid-cols-[auto_1fr_1.5rem_0.5rem_auto]',
        // Transitions
        'transition data-closed:data-leave:opacity-0 data-leave:duration-100 data-leave:ease-in',
      )}
    />
  );
}

export function DropdownItem({
  className,
  ...props
}: { className?: string } & (
  | Omit<React.ComponentPropsWithoutRef<'button'>, 'as' | 'className'>
  | Omit<React.ComponentPropsWithoutRef<typeof Link>, 'className'>
)) {
  const classes = clsx(
    className,
    // Base styles
    'group rounded-lg px-3.5 py-2.5 focus:outline-hidden sm:px-3 sm:py-1.5',
    // Text styles
    'text-left text-base/6 text-foreground sm:text-sm/6 dark:text-white forced-colors:text-[CanvasText]',
    // Focus — the accent pair, so hover and keyboard focus read the same.
    'data-focus:bg-accent data-focus:text-accent-foreground',
    // Disabled state
    'data-disabled:opacity-50',
    // Forced colors mode
    'forced-color-adjust-none forced-colors:data-focus:bg-[Highlight] forced-colors:data-focus:text-[HighlightText] forced-colors:data-focus:*:data-[slot=icon]:text-[HighlightText]',
    // Use subgrid when available but fallback to an explicit grid layout if not
    'col-span-full grid grid-cols-[auto_1fr_1.5rem_0.5rem_auto] items-center supports-[grid-template-columns:subgrid]:grid-cols-subgrid',
    // Icons
    '*:data-[slot=icon]:col-start-1 *:data-[slot=icon]:row-start-1 *:data-[slot=icon]:-ml-0.5 *:data-[slot=icon]:mr-2.5 *:data-[slot=icon]:size-5 sm:*:data-[slot=icon]:mr-2 sm:*:data-[slot=icon]:size-4',
    '*:data-[slot=icon]:text-muted-foreground data-focus:*:data-[slot=icon]:text-white dark:*:data-[slot=icon]:text-muted-foreground dark:data-focus:*:data-[slot=icon]:text-white',
    // Avatar
    '*:data-[slot=avatar]:-ml-1 *:data-[slot=avatar]:mr-2.5 *:data-[slot=avatar]:size-6 sm:*:data-[slot=avatar]:mr-2 sm:*:data-[slot=avatar]:size-5',
    // Cursor pointer by default
    'cursor-pointer',
  );

  return (
    <HeadlessMenuItem>
      {'href' in props ? (
        <Link {...props} className={classes} />
      ) : (
        <button type="button" {...props} className={classes} />
      )}
    </HeadlessMenuItem>
  );
}

export function DropdownHeader({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      {...props}
      className={clsx(className, 'col-span-5 px-3.5 pb-1 pt-2.5 sm:px-3')}
    />
  );
}

export function DropdownSection({
  className,
  ...props
}: { className?: string } & Omit<
  HeadlessMenuSectionProps,
  'as' | 'className'
>) {
  return (
    <HeadlessMenuSection
      {...props}
      className={clsx(
        className,
        // Define grid at the section level instead of the item level if subgrid is supported
        'col-span-full supports-[grid-template-columns:subgrid]:grid supports-[grid-template-columns:subgrid]:grid-cols-[auto_1fr_1.5rem_0.5rem_auto]',
      )}
    />
  );
}

export function DropdownHeading({
  className,
  ...props
}: { className?: string } & Omit<
  HeadlessMenuHeadingProps,
  'as' | 'className'
>) {
  return (
    <HeadlessMenuHeading
      {...props}
      className={clsx(
        className,
        'col-span-full grid grid-cols-[1fr_auto] gap-x-12 px-3.5 pb-1 pt-2 text-sm/5 font-medium text-muted-foreground sm:px-3 sm:text-xs/5',
      )}
    />
  );
}

export function DropdownDivider({
  className,
  ...props
}: { className?: string } & Omit<
  HeadlessMenuSeparatorProps,
  'as' | 'className'
>) {
  return (
    <HeadlessMenuSeparator
      {...props}
      className={clsx(
        className,
        'col-span-full mx-3.5 my-1 h-px border-0 bg-paper-300 sm:mx-3 dark:bg-white/10 forced-colors:bg-[CanvasText]',
      )}
    />
  );
}

export function DropdownLabel({
  className,
  ...props
}: { className?: string } & Omit<HeadlessLabelProps, 'as' | 'className'>) {
  return (
    <HeadlessLabel
      {...props}
      data-slot="label"
      className={clsx(className, 'col-start-2 row-start-1')}
      {...props}
    />
  );
}

export function DropdownDescription({
  className,
  ...props
}: { className?: string } & Omit<
  HeadlessDescriptionProps,
  'as' | 'className'
>) {
  return (
    <HeadlessDescription
      data-slot="description"
      {...props}
      className={clsx(
        className,
        'col-span-2 col-start-2 row-start-2 text-sm/5 text-muted-foreground group-data-focus:text-white sm:text-xs/5 forced-colors:group-data-focus:text-[HighlightText]',
      )}
    />
  );
}

export function DropdownShortcut({
  keys,
  className,
  ...props
}: { keys: string | string[]; className?: string } & Omit<
  HeadlessDescriptionProps<'kbd'>,
  'as' | 'className'
>) {
  return (
    <HeadlessDescription
      as="kbd"
      {...props}
      className={clsx(
        className,
        'col-start-5 row-start-1 flex justify-self-end',
      )}
    >
      {(Array.isArray(keys) ? keys : keys.split('')).map((char, index) => (
        <kbd
          key={index}
          className={clsx([
            'min-w-[2ch] text-center font-sans capitalize text-muted-foreground group-data-focus:text-white forced-colors:group-data-focus:text-[HighlightText]',
            // Make sure key names that are longer than one character (like "Tab") have extra space
            index > 0 && char.length > 1 && 'pl-1',
          ])}
        >
          {char}
        </kbd>
      ))}
    </HeadlessDescription>
  );
}
