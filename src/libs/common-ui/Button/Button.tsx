import {
  forwardRef,
  memo,
  type ComponentProps,
  type ForwardedRef,
} from 'react';
import { classMerge } from '../utils/cn';
import { SpinnerSVG } from '../icons/SpinnerSVG';

type Props = Readonly<{
  label?: string;
  isLoading?: boolean;
  iconRight?: React.ReactNode;
  iconLeft?: React.ReactNode;
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
      disabled,
      ...rest
    }: Props,
    ref: ForwardedRef<HTMLButtonElement>
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        {...rest}
        className={classMerge(
          'cursor-pointer rounded-md bg-blue-400 px-3.5 py-2.5 text-md font-semibold text-white shadow-sm hover:bg-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600',
          disabled || isLoading
            ? 'cursor-not-allowed bg-gray-400 hover:bg-gray-400 text-gray-300'
            : '',
          className
        )}
      >
        <span className="flex items-center">
          {iconLeft && !isLoading ? (
            <span className="pr-2">{iconLeft}</span>
          ) : null}{' '}
          {label}{' '}
          {iconRight && !isLoading ? (
            <span className="pl-2">{iconRight}</span>
          ) : null}
          {isLoading && <SpinnerSVG />}
        </span>
      </button>
    );
  }
);

export const Button = memo(ButtonComponent);

ButtonComponent.displayName = 'Button';
