import { useId, forwardRef, type ComponentPropsWithRef, type Ref } from 'react';
import { useTranslations } from 'next-intl';
import type { FieldError } from 'react-hook-form';

import { classMerge } from '../utils/cn';
import { OpenEyeIcon, EyeOffIcon } from '@salesyy/common-ui';
import { Text } from '../Text';

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
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const t = useTranslations('Sign-in');


    const togglePasswordVisibility = () => {
      setIsPasswordVisible((prev) => !prev);
    };

    const inputType = type === 'password' && isPasswordVisible ? 'text' : type;

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
          <div className="relative">
            <input
              ref={ref}
              id={id}
              type={inputType}
              min={min}
              max={max}
              step={step}
              className={classMerge(
                'block w-full px-1.5 dark:bg-slate-900 dark:text-gray-300 text-gray-900 sm:text-sm sm:leading-6 overflow-auto',
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
            {type === 'password' && (
              <button
                type="button"
                onClick={togglePasswordVisibility}
                className="absolute inset-y-0 right-0 px-3 flex items-center bg-gray-100 dark:bg-slate-700 border-l border-gray-300 dark:border-slate-600"
              >
                {isPasswordVisible ? <EyeOffIcon /> : <OpenEyeIcon />}
              </button>
            )}
          </div>
        </div>
        {error && (
          <>
            <Text
              className="mt-2 text-sm text-red-600 dark:text-red-500"
              id="input-error"
            >
              {t(errorMessage ? errorMessage : error.message)}
            </Text>
          </>
        )}
        {hint && (
          <Text
            className="mt-2 text-sm text-gray-500 dark:text-gray-400"
            id="input-description"
          >
            {hint}
          </Text>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
