'use client';

import {
  useId,
  forwardRef,
  type ForwardedRef,
  ComponentPropsWithRef,
  useEffect,
  useRef,
  MouseEventHandler,
} from 'react';
import { useTranslations } from 'next-intl';
import {
  ArrowRightCircleIcon,
  ExclamationCircleIcon,
  MicrophoneIcon,
  StopIcon,
} from '@heroicons/react/20/solid';
import type { FieldError } from 'react-hook-form';

import { SpinnerSVG } from '../icons';
import { classMerge } from '../utils/cn';
import { Text } from '../Text/Text';
import { useVoiceInput } from '../../../app/hooks/useAudioRecording';

type Props = {
  label?: string;
  hint?: string;
  error?: FieldError;
  containerClassName?: string;
  handleResponseType?: () => void;
  errorMessage?: string;
  maxHeight?: number;
  onSend?: () => void;
  setValue?: (text: string) => void;
  value?: string;
  mandatory?: boolean;
  showVoiceInput?: boolean;
  showArrowIcon?: boolean;
  disabled?: boolean;
  handleSubmit?: (e?: React.BaseSyntheticEvent) => Promise<void>;
} & ComponentPropsWithRef<'textarea'>;

export const Textarea = forwardRef(
  (
    {
      label,
      hint,
      error,
      errorMessage,
      handleResponseType,
      className,
      disabled,
      showVoiceInput = true,
      showArrowIcon = true,
      containerClassName,
      mandatory = false,
      maxHeight = 200,
      onSend,
      setValue,
      value,
      handleSubmit,
      ...rest
    }: Props,
    ref: ForwardedRef<HTMLTextAreaElement>
  ) => {
    const id = useId();
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const t = useTranslations('text-area');

    const {
      startListening,
      stopListening,
      isRecording,
      error: voiceError,
    } = useVoiceInput({
      onResult: (text) => {
        if (setValue) {
          setValue(text);
        }
      },
    });

    const handleStartListening = () => {
      handleResponseType?.();
      startListening();
    };

    useEffect(() => {
      if (!isRecording && value?.trim()) {
        onSend?.();
      }
    }, [isRecording]);

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
      if (value !== undefined) {
        adjustHeight();
      }
    }, [value]);

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        onSend?.();
      }
    };

    const handleIconClick: MouseEventHandler<HTMLButtonElement> = () => {
      if (handleSubmit) {
        handleSubmit();
      } else {
        onSend?.();
      }
    };

    const maxHeightClass = `max-h-[${maxHeight}px]`;

    /**
     * Kontrolujemy wyświetlanie poszczególnych ikon głosowych / strzałki
     * w zależności od showVoiceInput oraz showArrowIcon.
     */
    let icon = null;
    let onClick: (() => void) | undefined = undefined;

    if (showVoiceInput) {
      if (disabled && !value?.trim()) {
        icon = <SpinnerSVG className="mb-1.5" aria-hidden="true" />;
      } else if (isRecording) {
        icon = (
          <StopIcon
            className="h-7 w-7 mb-1.5 text-red-500 hover:text-red-600 dark:text-red-400"
            aria-hidden="true"
          />
        );
        onClick = stopListening;
      } else if (value?.trim() && showArrowIcon) {
        icon = (
          <ArrowRightCircleIcon
            className={classMerge(
              'h-9 w-9',
              disabled
                ? 'text-gray-300 dark:text-gray-600'
                : 'text-blue-500 dark:text-gray-200 hover:text-blue-600 dark:hover:text-gray-300'
            )}
            aria-hidden="true"
          />
        );
        onClick = disabled ? undefined : onSend;
      } else {
        icon = (
          <MicrophoneIcon
            className={classMerge(
              'h-7 w-7 mb-1.5',
              'text-gray-600 dark:text-gray-200 hover:text-gray-700 dark:hover:text-gray-300'
            )}
            aria-hidden="true"
          />
        );
        onClick = handleStartListening;
      }
    } else {
      if (showArrowIcon) {
        icon = (
          <ArrowRightCircleIcon
            className={classMerge(
              'h-9 w-9',
              value?.trim()
                ? 'text-blue-500 dark:text-gray-200 hover:text-blue-600 dark:hover:text-gray-300'
                : 'text-gray-300 dark:text-gray-600'
            )}
            aria-hidden="true"
          />
        );
        onClick = value?.trim() ? onSend : undefined;
      } else {
        // Brak ikony jeśli nie używamy voice input i nie chcemy strzałki
        icon = null;
      }
    }

    return (
      <div className={classMerge('relative', containerClassName)}>
        <label
          htmlFor={id}
          className="block text-sm font-medium leading-6 dark:text-gray-300"
        >
          {label}
          {mandatory && <span className="text-red-600">*</span>}
        </label>
        <div className={error ? 'relative mt-2 rounded-md shadow-xs' : 'mt-2'}>
          <div className="relative">
            <textarea
              id={id}
              ref={(el) => {
                textareaRef.current = el;
                if (typeof ref === 'function') {
                  ref(el);
                } else if (ref) {
                  (
                    ref as React.MutableRefObject<HTMLTextAreaElement | null>
                  ).current = el;
                }
              }}
              rows={1}
              disabled={disabled}
              className={classMerge(
                'block w-full dark:bg-secondary-dark dark:text-gray-300 rounded-md border border-gray-300 dark:border-gray-800 px-2.5 py-3 text-gray-900 placeholder:text-gray-600 dark:placeholder:text-gray-500 sm:text-sm sm:leading-6 focus:ring-0 focus:outline-hidden resize-none overflow-y-auto min-h-[50px]',
                maxHeightClass,
                {
                  'text-red-900 ring-red-300 placeholder:text-red-300 focus:ring-red-500':
                    error,
                  'shadow-xs': !error,
                },
                'pr-12',
                className
              )}
              onInput={adjustHeight}
              onKeyDown={handleKeyDown}
              value={value}
              placeholder={t('placeholder')}
              {...rest}
            />
            {icon && (
              <button
                type="button"
                onClick={handleIconClick}
                className="absolute bottom-1.5 right-3 flex items-center"
              >
                {icon}
              </button>
            )}
          </div>
        </div>

        {error && (
          <Text
            className="flex items-center mt-2 text-sm text-red-600"
            id="email-error"
          >
            <ExclamationCircleIcon
              className="h-4 w-4 mr-1 text-red-500"
              aria-hidden="true"
            />
            {errorMessage ? errorMessage : error.message}
          </Text>
        )}

        {voiceError && (
          <Text className="flex items-center mt-2 text-sm text-red-500">
            <ExclamationCircleIcon
              className="h-4 w-4 mr-1 text-red-500"
              aria-hidden="true"
            />
            {voiceError}
          </Text>
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
