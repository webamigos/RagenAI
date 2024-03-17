import { forwardRef, type ComponentProps, type ForwardedRef } from 'react';
import { classMerge } from '../utils/cn';

type Props = Readonly<{
  label: string;
  isLoading?: boolean;
  iconRight?: React.ReactNode;
  iconLeft?: React.ReactNode;
}> &
  ComponentProps<'button'>;

const Spinner = () => (
  <svg
    className="animate-spin -ml-1 h-5 w-5  dark:text-white ml-2"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    ></circle>
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    ></path>
  </svg>
);

export const Button = forwardRef(
  (
    {
      label,
      iconRight,
      iconLeft,
      className,
      isLoading = false,
      ...rest
    }: Props,
    ref: ForwardedRef<HTMLButtonElement>
  ) => {
    return (
      <button
        ref={ref}
        {...rest}
        className={classMerge(
          'cursor-pointer rounded-md bg-blue-500 px-3.5 py-2.5 text-md font-semibold text-white shadow-sm hover:bg-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600',
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
          {isLoading && <Spinner />}
        </span>
      </button>
    );
  }
);
