import {
  Description as HeadlessDescription,
  type DescriptionProps as HeadlessDescriptionProps,
  Dialog as HeadlessDialog,
  DialogBackdrop as HeadlessDialogBackdrop,
  DialogPanel as HeadlessDialogPanel,
  type DialogProps as HeadlessDialogProps,
  DialogTitle as HeadlessDialogTitle,
  type DialogTitleProps as HeadlessDialogTitleProps,
} from '@headlessui/react';
import clsx from 'clsx';
import React from 'react';
import { Text } from '../Text';

const sizes = {
  xs: 'sm:max-w-xs',
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
  '2xl': 'sm:max-w-2xl',
  '3xl': 'sm:max-w-3xl',
  '4xl': 'sm:max-w-4xl',
  '5xl': 'sm:max-w-5xl',
};

export function Dialog({
  size = 'lg',
  className,
  children,
  ...props
}: {
  size?: keyof typeof sizes;
  className?: string;
  children: React.ReactNode;
} & Omit<HeadlessDialogProps, 'as' | 'className'>) {
  // TODO: there is a problem with bg-zinc-500-25 looks like ignored

  return (
    <HeadlessDialog {...props} className="relative z-10">
      <HeadlessDialogBackdrop
        transition
        className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity data-closed:opacity-0 data-enter:duration-300 data-leave:duration-200 data-enter:ease-out data-leave:ease-in"
      />
      {/*
       */}
      <div className="fixed inset-0 w-screen overflow-y-auto flex items-center justify-center p-4">
        <HeadlessDialogPanel
          transition
          className={clsx(
            className,
            sizes[size],
            'w-full min-w-0 rounded-2xl bg-white p-5 shadow-lg ring-zinc-950/10 dark:bg-secondary-dark dark:ring-white/10 forced-colors:outline',
            'transition duration-100 will-change-transform',
            'data-closed:scale-95 data-closed:opacity-0 data-enter:ease-out data-leave:ease-in',
          )}
        >
          {children}
        </HeadlessDialogPanel>
      </div>
    </HeadlessDialog>
  );
}

export function DialogTitle({
  className,
  ...props
}: { className?: string } & Omit<
  HeadlessDialogTitleProps,
  'as' | 'className'
>) {
  return (
    <HeadlessDialogTitle
      {...props}
      className={clsx(
        className,
        'text-balance text-lg/6 font-semibold text-zinc-950 sm:text-base/6 dark:text-white',
      )}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: { className?: string } & Omit<
  HeadlessDescriptionProps<typeof Text>,
  'as' | 'className'
>) {
  return <HeadlessDescription as={Text} {...props} />;
}

export function DialogBody({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return <div {...props} className={clsx(className, 'mt-6')} />;
}

export function DialogActions({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      {...props}
      className={clsx(
        className,
        'mt-8 flex flex-col-reverse items-center justify-end gap-3 *:w-full sm:flex-row sm:*:w-auto',
      )}
    />
  );
}
