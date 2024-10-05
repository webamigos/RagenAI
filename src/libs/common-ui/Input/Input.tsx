import { useId, forwardRef, type ComponentPropsWithRef, type Ref } from 'react';
import type { FieldError } from 'react-hook-form';
import { classMerge } from '../utils/cn';

type Props = {
  label?: string;
  hint?: string;
  error?: FieldError;
  errorMessage?: string; // for translations
  containerClassName?: string;
  type?: 'text' | 'range' | 'number' | 'email' | 'password';
  min?: number;
  max?: number;
  step?: number;
} & ComponentPropsWithRef<'input'>;

export const Input = forwardRef(
  (
    {
      label,
      hint,
      error,
      errorMessage,
      className,
      containerClassName,
      type = 'text',
      min,
      max,
      step,
      ...rest
    }: Props,
    ref: Ref<HTMLInputElement>
  ) => {
    const id = useId();

    if (
      type === 'range' &&
      (min === undefined || max === undefined || step === undefined)
    ) {
      throw new Error(
        'Props "min", "max" and "step" are required for input type "range".'
      );
    }

    return (
      <div className={classMerge('pt-2', containerClassName)}>
        {label && (
          <label
            htmlFor={id}
            className="block text-sm font-medium leading-6 dark:text-gray-300"
          >
            {label}
          </label>
        )}
        <div className={error ? 'relative mt-2 rounded-md shadow-sm' : 'mt-2'}>
          <input
            ref={ref}
            id={id}
            type={type}
            min={min}
            max={max}
            step={step}
            className={classMerge(
              'block w-full dark:bg-slate-900 dark:text-gray-300 py-1.5 px-1.5 text-gray-900 sm:text-sm sm:leading-6',
              {
                'ring-1 ring-inset ring-gray-300 rounded-md focus:ring-blue-500 focus:ring-2 focus:ring-inset':
                  type !== 'range',
                'text-red-900 ring-red-300 placeholder:text-red-300 focus:ring-red-500':
                  error,
                'shadow-sm': !error,
              },
              className
            )}
            {...rest}
          />
        </div>
        {error && (
          <p
            className="mt-2 text-sm text-red-600 dark:text-red-500"
            id="input-error"
          >
            {errorMessage ? errorMessage : error.message}
          </p>
        )}
        {hint && (
          <p
            className="mt-2 text-sm text-gray-500 dark:text-gray-400"
            id="input-description"
          >
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
