import {
  forwardRef,
  memo,
  type ComponentProps,
  type ForwardedRef,
} from 'react';
import { classMerge } from '../utils/cn';
import { SpinnerSVG, ArrowPath, ClourArrowIcon } from '../icons';

type Props = Readonly<{
  label?: string;
  isLoading?: boolean;
  iconRight?: React.ReactNode;
  iconLeft?: React.ReactNode;
  isSubmit?: boolean;
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
      isSubmit = false,
      disabled,
      children,
      ...rest
    }: Props,
    ref: ForwardedRef<HTMLButtonElement>
  ) => {
    const baseClasses =
      'cursor-pointer rounded-full px-4 py-2 text-md font-semibold text-white shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-transform duration-200';
    const errorClasses =
      'mt-2 p-2 bg-red-500 text-white hover:bg-red-600 shadow-lg rounded-lg';
    const normalClasses = 'bg-primary-blue-400 hover:bg-primary-blue-500';
    const disabledClasses =
      'cursor-not-allowed bg-gray-400 hover:bg-gray-400 text-gray-300 shadow-lg';

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
          {label && <span>{label}</span>}
          {children}
          {iconRight && !isLoading && <span className="pl-2">{iconRight}</span>}
          {isLoading && <SpinnerSVG size="sm" className="ml-3 text-white" />}
          {isError && <ArrowPath />}
          {isSubmit && <ClourArrowIcon className="ml-2" />}
        </span>
      </button>
    );
  }
);

export const Button = memo(ButtonComponent);

ButtonComponent.displayName = 'Button';
