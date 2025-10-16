import {
  forwardRef,
  memo,
  type ComponentProps,
  type ForwardedRef,
} from 'react';
import { classMerge } from '../utils/cn';
import { SpinnerSVG, ArrowPath } from '../icons';
import { Button as TuiButton, type ButtonProps } from '@ragenai/tui';

type Props = Readonly<{
  label?: string;
  isLoading?: boolean;
  iconRight?: React.ReactNode;
  iconLeft?: React.ReactNode;
  isSubmit?: boolean;
  isLink?: boolean;
  isError?: boolean;
  children?: React.ReactNode;
}> &
  ButtonProps &
  ComponentProps<'button'>;

const ButtonComponent = forwardRef(
  (
    {
      label,
      iconRight,
      iconLeft,
      className,
      isLoading = false,
      isError = false,
      isLink = false,
      isSubmit = false,
      disabled,
      children,
      ...rest
    }: Props,
    ref: ForwardedRef<HTMLElement>
  ) => {
    // const baseClasses =
    //   'text-sm/6 text-white font-semibold cursor-pointer rounded-md px-4 py-2 font-semibold shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-transform duration-200';
    const baseClasses = '';
    const errorClasses =
      'mt-2 p-2 bg-red-500 text-white hover:bg-red-600 shadow-lg rounded-md';
    // const normalClasses =
    //   'bg-blue-600 hover:bg-blue-500 dark:bg-accent-dark-500 dark:hover:bg-accent-dark-700 dark:disabled:bg-accent-dark-300';
    const normalClasses = '';
    const disabledClasses =
      'cursor-not-allowed bg-gray-400 hover:bg-gray-400 text-gray-300 shadow-lg';
    const linkClasses =
      'flex items-center gap-3 rounded-md px-2 py-2.5 font-sans text-left text-base font-medium text-gray-600 dark:text-gray-400 md:py-2 text-sm hover:bg-primary-gray-200 dark:hover:bg-accent-dark-500';

    const { color: _, outline: __, plain: ___, ...tuiButtonProps } = rest;

    return (
      <TuiButton
        ref={ref as any}
        color="indigo"
        disabled={disabled || isLoading || isError}
        {...tuiButtonProps}
        className={
          isLink
            ? classMerge(linkClasses, className)
            : classMerge(
                baseClasses,
                isError ? errorClasses : normalClasses,
                (disabled || isLoading) && disabledClasses,
                className
              )
        }
      >
        <span className="flex items-center">
          {label && <span>{label}</span>}
          {children}
          {iconRight && !isLoading && <span className="pl-2">{iconRight}</span>}
          {isLoading && <SpinnerSVG size="sm" className="ml-3 text-white" />}
          {isError && <ArrowPath />}
        </span>
      </TuiButton>
    );
  }
);

export const Button = memo(ButtonComponent);

ButtonComponent.displayName = 'Button';
