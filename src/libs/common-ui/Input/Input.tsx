'use client';

import {
  useId,
  useEffect,
  forwardRef,
  type ComponentPropsWithRef,
  type Ref,
  HTMLProps,
  useState,
} from 'react';
import type { FieldError } from 'react-hook-form';
import { classMerge } from '../utils/cn';
import { Text } from '../Text';
import { useTranslations } from 'next-intl';

type Props = {
  autocomplete?: string;
  label?: string;
  hint?: string;
  error?: FieldError;
  errorMessage?: string;
  containerClassName?: string;
  mandatory?: boolean;
  type?: 'text' | 'range' | 'number' | 'email' | 'password';
  min?: HTMLProps<'min'>;
  max?: HTMLProps<'max'>;
  step?: number;
  isLoading?: boolean;
  skeletonHeight?: string;
  skeletonWidth?: string;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
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
      autocomplete,
      iconLeft,
      iconRight,
      ...rest
    }: Props,
    ref: Ref<HTMLInputElement>
  ) => {
    const id = useId();
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [OpenEyeIcon, setOpenEyeIcon] = useState<React.ComponentType | null>(
      null
    );
    const [EyeOffIcon, setEyeOffIcon] = useState<React.ComponentType | null>(
      null
    );
    const t = useTranslations();

    useEffect(() => {
      const loadIcons = async () => {
        const { OpenEyeIcon } = await import(
          '@ragenai/common-ui/icons/OpenEyeIcon'
        ).then((module) => ({ OpenEyeIcon: module.OpenEyeIcon }));
        const { EyeOffIcon } = await import(
          '@ragenai/common-ui/icons/EyeOffIcon'
        ).then((module) => ({ EyeOffIcon: module.EyeOffIcon }));
        setOpenEyeIcon(() => OpenEyeIcon);
        setEyeOffIcon(() => EyeOffIcon);
      };

      loadIcons();
    }, []);

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
            className="block text-sm text-gray-600 font-medium leading-6 dark:text-gray-300"
          >
            {label}
            {mandatory && <span className="text-red-600">*</span>}
          </label>
        )}
        <div className={error ? 'relative mt-2 rounded-md shadow-sm' : 'mt-2'}>
          <div className="relative flex items-center">
            {iconLeft && <span className="absolute left-3">{iconLeft}</span>}
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
                autoComplete={autocomplete}
                step={step}
                className={classMerge(
                  'block w-full dark:bg-accent-dark-500 dark:text-gray-300 text-gray-900 sm:text-sm sm:leading-6 overflow-auto',
                  {
                    'pl-2.5 pr-12 ring-1 ring-inset ring-primary-blue-500 dark:ring-gray-600 rounded-2xl cursor-pointer':
                      type !== 'range',
                    'text-red-900 ring-red-300 placeholder:text-red-300 focus-visible:ring-red-500 focus-visible:ring-2':
                      error,
                    'shadow-sm': !error,
                  },
                  className
                )}
                {...rest}
              />
            )}
            {type === 'password' && !isLoading && OpenEyeIcon && EyeOffIcon && (
              <button
                type="button"
                onClick={togglePasswordVisibility}
                className="absolute inset-y-0 right-2 px-3 flex items-center dark:border-slate-600"
              >
                {isPasswordVisible ? <EyeOffIcon /> : <OpenEyeIcon />}
              </button>
            )}
            {iconRight && (
              <span className="absolute right-3 flex items-center">
                {iconRight}
              </span>
            )}
          </div>
        </div>
        {error && !isLoading && (
          <Text
            className="mt-4 text-sm text-red-600 dark:text-red-500"
            id="input-error"
          >
            {t(errorMessage ? errorMessage : error.message)}
          </Text>
        )}
        {hint && !isLoading && (
          <Text
            className="text-sm text-gray-500 dark:text-gray-400"
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
