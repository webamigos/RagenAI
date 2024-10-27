import {
  useState,
  useId,
  forwardRef,
  type ComponentPropsWithRef,
  type Ref,
  HTMLProps,
} from 'react';
import type { FieldError } from 'react-hook-form';

import { classMerge } from '../utils/cn';
import { Text } from '../Text';
import { lazy, Suspense } from 'react';
import { useTranslations } from 'next-intl';

const OpenEyeIcon = lazy(() =>
  import('@salesyy/common-ui').then((module) => ({
    default: module.OpenEyeIcon,
  }))
);
const EyeOffIcon = lazy(() =>
  import('@salesyy/common-ui').then((module) => ({
    default: module.EyeOffIcon,
  }))
);

type Props = {
  label?: string;
  hint?: string;
  error?: FieldError;
  errorMessage?: string; // for translations
  containerClassName?: string;
  mandatory?: boolean;
  type?: 'text' | 'range' | 'number' | 'email' | 'password';
  min?: HTMLProps<'min'>;
  max?: HTMLProps<'max'>;
  step?: number;
  isLoading?: boolean;
  skeletonHeight?: string;
  skeletonWidth?: string;
} & ComponentPropsWithRef<'input'>;

export const Input = forwardRef(
  (
    {
      label,
      hint,
      error,
      errorMessage,
      className,
      mandatory = false,
      containerClassName,
      type = 'text',
      min,
      max,
      step,
      isLoading = false,
      skeletonHeight = 'h-5',
      skeletonWidth = 'w-50',
      ...rest
    }: Props,
    ref: Ref<HTMLInputElement>
  ) => {
    const id = useId();
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const t = useTranslations();

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
            {mandatory && <span className="text-red-600">*</span>}
            {label}
          </label>
        )}
        <div className={error ? 'relative mt-2 rounded-md shadow-sm' : 'mt-2'}>
          <div className="relative">
            {isLoading ? (
              <div
                className={classMerge(
                  'animate-pulse bg-gray-300 dark:bg-slate-700 rounded-md',
                  skeletonHeight,
                  skeletonWidth
                )}
              />
            ) : (
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
                    'ring-1 ring-inset ring-gray-300 rounded-md focus:ring-blue-500 focus:ring-2 focus:ring-inset cursor-pointer':
                      type !== 'range',
                    'text-red-900 ring-red-300 placeholder:text-red-300 focus:ring-red-500':
                      error,
                    'shadow-sm': !error,
                  },
                  className
                )}
                {...rest}
              />
            )}
            {type === 'password' && !isLoading && (
              <button
                type="button"
                onClick={togglePasswordVisibility}
                className="absolute inset-y-0 right-0 px-3 flex items-center bg-gray-100 dark:bg-slate-700 border-l border-gray-300 dark:border-slate-600"
              >
                <Suspense fallback={null}>
                  {isPasswordVisible ? <EyeOffIcon /> : <OpenEyeIcon />}
                </Suspense>
              </button>
            )}
          </div>
        </div>
        {error && !isLoading && (
          <>
            <Text
              className="mt-2 text-sm text-red-600 dark:text-red-500"
              id="input-error"
            >
              {t(errorMessage ? errorMessage : error.message)}
            </Text>
          </>
        )}
        {hint && !isLoading && (
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
