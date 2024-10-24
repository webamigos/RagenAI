import {
  forwardRef,
  memo,
  type ComponentProps,
  type ForwardedRef,
} from 'react';
import { classMerge } from '../utils/cn';
import { SpinnerSVG, ArrowPath } from '../icons';

type Props = Readonly<{
  label?: string;
  isLoading?: boolean;
  iconRight?: React.ReactNode;
  iconLeft?: React.ReactNode;
  isError?: boolean;
  children?: React.ReactNode;
}> &
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
      disabled,
      children,
      ...rest
    }: Props,
    ref: ForwardedRef<HTMLButtonElement>
  ) => {
    const baseClasses =
      'cursor-pointer rounded-2xl px-3.5 py-2.5 text-md font-semibold text-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600';
    const errorClasses = 'mt-2 p-2 bg-green-300 text-white hover:bg-green-400';
    const normalClasses = 'bg-blue-500 hover:bg-blue-600';
    const disabledClasses =
      'cursor-not-allowed bg-gray-400 hover:bg-gray-400 text-gray-300';

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading || isError}
        {...rest}
        className={classMerge(
          baseClasses,
          isError ? errorClasses : normalClasses,
          (disabled || isLoading) && disabledClasses,
          className
        )}
      >
        <span className="flex items-center">
          {iconLeft && !isLoading && <span className="pr-2">{iconLeft}</span>}
          {label && <span>{label}</span>}
          {children}
          {iconRight && !isLoading && <span className="pl-2">{iconRight}</span>}
          {isLoading && <SpinnerSVG size="sm" className="ml-3 text-white" />}
          {isError && <ArrowPath />}
        </span>
      </button>
    );
  }
);

export const Button = memo(ButtonComponent);

ButtonComponent.displayName = 'Button';
