import {
  useId,
  forwardRef,
  type ForwardedRef,
  ComponentPropsWithRef,
  useEffect,
  useRef,
} from 'react';
import {
  ArrowRightCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/20/solid';
import type { FieldError } from 'react-hook-form';

import { classMerge } from '../utils/cn';
import { Text } from '../Text/Text';

type Props = {
  label: string;
  hint?: string;
  error?: FieldError;
  containerClassName?: string;
  errorMessage?: string; // for translations
  maxHeight?: number;
  onSend?: () => void;
  value: string;
} & ComponentPropsWithRef<'textarea'>;

export const Textarea = forwardRef(
  (
    {
      label,
      hint,
      error,
      errorMessage,
      className,
      containerClassName,
      maxHeight = 200,
      onSend,
      value,
      ...rest
    }: Props,
    ref: ForwardedRef<HTMLTextAreaElement>
  ) => {
    const id = useId();
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    const adjustHeight = () => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(
          textarea.scrollHeight,
          maxHeight
        )}px`;
      }
    };

    useEffect(() => {
      adjustHeight();
    }, [value]);

    return (
      <div className={classMerge('py-2 relative', containerClassName)}>
        <label
          htmlFor={id}
          className="block text-sm font-medium leading-6 dark:text-gray-300"
        >
          {label}
        </label>
        <div className={error ? 'relative mt-2 rounded-md shadow-sm' : 'mt-2'}>
          <div className="relative">
            <textarea
              id={id}
              ref={(el) => {
                textareaRef.current = el;
                if (typeof ref === 'function') {
                  ref(el);
                } else if (ref) {
                  ref.current = el;
                }
              }}
              rows={1}
              className={classMerge(
                'block w-full dark:bg-slate-900 dark:text-gray-300 rounded-2xl border-0 py-1.5 px-2.5 text-gray-900 placeholder:text-gray-400 sm:text-sm sm:leading-6 focus:ring-0 focus:outline-none resize-none overflow-y-auto',
                {
                  'text-red-900 ring-red-300 placeholder:text-red-300 focus:ring-red-500':
                    error,
                  'shadow-sm': !error,
                },
                onSend ? 'pr-12' : '',
                className
              )}
              style={{ maxHeight: `${maxHeight}px` }}
              onInput={adjustHeight}
              value={value}
              {...rest}
            />
            {onSend && (
              <button
                type="button"
                onClick={onSend}
                className="absolute bottom-1 right-3 flex items-center"
                disabled={!value.trim()}
              >
                <ArrowRightCircleIcon
                  className={`h-7 w-7 ${
                    value.trim()
                      ? 'text-blue-500 hover:text-blue-600'
                      : 'text-gray-400'
                  }`}
                  aria-hidden="true"
                />
              </button>
            )}
          </div>
        </div>
        {error && (
          <>
            <Text
              className="flex items-center mt-2 text-sm text-red-600"
              id="email-error"
            >
              <ExclamationCircleIcon
                className="h-4 w-4 mr-1 text-red-500"
                aria-hidden="true"
              />{' '}
              {errorMessage ? errorMessage : error.message}
            </Text>
          </>
        )}
        {hint && (
          <Text
            className="mt-2 text-sm text-gray-500 dark:text-gray-400"
            id="email-description"
          >
            {hint}
          </Text>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
