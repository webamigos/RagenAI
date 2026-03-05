import {
  forwardRef,
  memo,
  type ComponentProps,
  type ForwardedRef,
} from 'react';
import { classMerge } from '../utils/cn';
import { SpinnerSVG, ArrowPath } from '../icons';
import { Button as TuiButton } from '@ragenai/tui/button';

type Props = Readonly<{
  label?: string;
  isLoading?: boolean;
  iconRight?: React.ReactNode;
  iconLeft?: React.ReactNode;
  isSubmit?: boolean;
  isLink?: boolean;
  isError?: boolean;
  outline?: boolean;
  plain?: boolean;
  children?: React.ReactNode;
}> &
  Omit<ComponentProps<'button'>, 'outline'> & { href?: string };

const ButtonComponent = forwardRef(
  (
    {
      label,
      iconRight,
      iconLeft: _iconLeft,
      className,
      isLoading = false,
      isError = false,
      isLink = false,
      isSubmit = false,
      outline = false,
      plain = false,
      disabled,
      children,
      ...rest
    }: Props,
    ref: ForwardedRef<HTMLElement>,
  ) => {
    const errorClasses =
      'mt-2 p-2 bg-red-500 text-white hover:bg-red-600 shadow-lg rounded-md';
    const linkClasses =
      'flex items-center gap-3 rounded-md px-2 py-2.5 font-sans text-left text-base font-medium text-gray-600 dark:text-gray-400 md:py-2 text-sm hover:bg-primary-gray-200 dark:hover:bg-accent-dark-500';

    const isDisabled = disabled || isLoading || isError;

    // Build variant props — TuiButton uses a discriminated union
    const variantProps = outline
      ? { outline: true as const }
      : plain
        ? { plain: true as const }
        : { color: 'indigo' as const };

    return (
      <TuiButton
        ref={ref as any}
        {...variantProps}
        disabled={isDisabled}
        {...(rest as any)}
        type={isSubmit ? 'submit' : (rest.type ?? 'button')}
        className={
          isLink
            ? classMerge(linkClasses, className)
            : classMerge(
                isError && errorClasses,
                isDisabled && 'cursor-not-allowed',
                className,
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
  },
);

export const Button = memo(ButtonComponent);

ButtonComponent.displayName = 'Button';
