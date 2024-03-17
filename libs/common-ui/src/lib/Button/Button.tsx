import { forwardRef, type ComponentProps, type ForwardedRef } from 'react';
import { classMerge } from '../utils/cn';

type Props = Readonly<{
  label: string;
  icon?: React.ReactNode;
  iconLeft?: React.ReactNode;
}> &
  ComponentProps<'button'>;

export const Button = forwardRef(
  (
    { label, icon, iconLeft, className, ...rest }: Props,
    ref: ForwardedRef<HTMLButtonElement>
  ) => {
    return (
      <button
        ref={ref}
        {...rest}
        className={classMerge(
          'cursor-pointer rounded-md bg-blue-600 px-3.5 py-2.5 text-md font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600',
          className
        )}
      >
        <span className="flex">
          {iconLeft ? <span className="pr-2">{iconLeft}</span> : null} {label}{' '}
          {icon ? <span className="pl-2">{icon}</span> : null}
        </span>
      </button>
    );
  }
);
