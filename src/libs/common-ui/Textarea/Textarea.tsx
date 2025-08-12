'use client';

import {
  useId,
  forwardRef,
  type ForwardedRef,
  ComponentPropsWithRef,
  useEffect,
  useRef,
  MouseEventHandler,
  useState,
} from 'react';
import { useTranslations } from 'next-intl';
import {
  ArrowRightCircleIcon,
  ExclamationCircleIcon,
  MicrophoneIcon,
  PaperClipIcon,
  StopIcon,
} from '@heroicons/react/20/solid';
import { CloudArrowUpIcon } from '@heroicons/react/24/outline';
import type { FieldError } from 'react-hook-form';

import { SpinnerSVG } from '../icons';
import { classMerge } from '../utils/cn';
import { Text } from '../Text/Text';
import { FileBadge } from '../Badge/FileBadge';
import { useVoiceInput } from '../../../app/hooks/useAudioRecording';
import { ThreadDocumentUI } from '../../../app/contracts/ThreadDocument';

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
  showFileAttachment?: boolean;
  onFileIconClick?: () => void;
  onFilesDrop?: (files: File[]) => void;
  threadDocuments?: ThreadDocumentUI[];
  onThreadDocumentRemove?: (index: number) => void;
  disabled?: boolean;
  handleSubmit?: (e?: React.BaseSyntheticEvent) => Promise<void>;
  modelSelector?: React.ReactNode;
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
      showFileAttachment = false,
      onFileIconClick,
      onFilesDrop,
      threadDocuments = [],
      onThreadDocumentRemove,
      containerClassName,
      mandatory = false,
      maxHeight = 200,
      onSend,
      setValue,
      value,
      handleSubmit,
      modelSelector,
      ...rest
    }: Props,
    ref: ForwardedRef<HTMLTextAreaElement>
  ) => {
    const id = useId();
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const t = useTranslations('text-area');
    const [isDragOver, setIsDragOver] = useState(false);

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

    const handleDragEnter = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (showFileAttachment && !disabled) {
        setIsDragOver(true);
      }
    };

    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      if (
        e.clientX < rect.left ||
        e.clientX >= rect.right ||
        e.clientY < rect.top ||
        e.clientY >= rect.bottom
      ) {
        setIsDragOver(false);
      }
    };

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (showFileAttachment && !disabled && onFilesDrop) {
        const files = Array.from(e.dataTransfer.files);
        onFilesDrop(files);
      }
    };

    const handleFileIconClick = () => {
      if (!disabled && fileInputRef.current) {
        fileInputRef.current.click();
      }
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0 && onFilesDrop) {
        onFilesDrop(files);
      }
      e.target.value = '';
    };

    const maxHeightClass = `max-h-[${maxHeight}px]`;

    let icon = null;
    let onClick: (() => void) | undefined = undefined;

    const attachmentIcon = showFileAttachment ? (
      <PaperClipIcon
        className={classMerge(
          'h-6 w-6',
          'text-gray-600 dark:text-gray-200 hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer'
        )}
        aria-hidden="true"
      />
    ) : null;

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
          <div
            className="relative"
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
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
                'block w-full dark:bg-secondary-dark dark:text-gray-300 rounded-md border border-gray-300 dark:border-gray-800 py-3 text-gray-900 placeholder:text-gray-600 dark:placeholder:text-gray-500 sm:text-sm sm:leading-6 focus:ring-0 focus:outline-hidden resize-none overflow-y-auto min-h-[50px] transition-colors',
                maxHeightClass,
                {
                  'text-red-900 ring-red-300 placeholder:text-red-300 focus:ring-red-500':
                    error,
                  'shadow-xs': !error,
                  'border-2 border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20':
                    isDragOver,
                  'border border-gray-300 dark:border-gray-800':
                    !isDragOver && !error,
                },
                modelSelector && showFileAttachment
                  ? 'px-2.5 pr-28'
                  : modelSelector
                  ? 'px-2.5 pr-24'
                  : showFileAttachment
                  ? 'px-2.5 pr-20'
                  : 'px-2.5 pr-12',
                className
              )}
              onInput={adjustHeight}
              onKeyDown={handleKeyDown}
              value={value}
              placeholder={t('placeholder')}
              {...rest}
            />

            {modelSelector && (
              <div className="absolute bottom-1.5 right-21 flex items-center">
                {modelSelector}
              </div>
            )}

            {isDragOver && (
              <div className="absolute inset-0 flex items-center justify-center bg-blue-100/80 dark:bg-blue-900/40 rounded-md pointer-events-none">
                <div className="flex flex-col items-center text-blue-600 dark:text-blue-400">
                  <CloudArrowUpIcon className="h-8 w-8 mb-2" />
                  <span className="text-sm font-medium">Drop files here</span>
                </div>
              </div>
            )}

            {attachmentIcon && (
              <button
                type="button"
                onClick={onFileIconClick || handleFileIconClick}
                className="absolute bottom-3.5 right-12 flex items-center"
              >
                {attachmentIcon}
              </button>
            )}

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

        {threadDocuments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {threadDocuments.map((document, index) => (
              <FileBadge
                key={`${document.name}-${index}`}
                document={document}
                onRemove={() => onThreadDocumentRemove?.(index)}
              />
            ))}
          </div>
        )}

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

        {showFileAttachment && (
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.srt,.txt"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
