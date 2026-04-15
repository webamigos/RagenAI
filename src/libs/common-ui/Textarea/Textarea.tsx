'use client';

import {
  useId,
  forwardRef,
  useCallback,
  type ForwardedRef,
  type ComponentPropsWithRef,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslations } from 'next-intl';
import {
  ArrowRightCircleIcon,
  DocumentTextIcon,
  ExclamationCircleIcon,
  MicrophoneIcon,
  PlusIcon,
  StopIcon,
} from '@heroicons/react/20/solid';
import { CloudArrowUpIcon } from '@heroicons/react/24/outline';
import type { FieldError } from 'react-hook-form';

import { SpinnerSVG } from '../icons';
import { classMerge } from '../utils/cn';
import { Text } from '../Text/Text';
import { FileBadge } from '../Badge/FileBadge';
import { useVoiceInput } from '../../../app/hooks/useAudioRecording';
import { type ThreadDocumentUI } from '@/features/documents/contracts/document.types';

type Props = {
  label?: string;
  hint?: string;
  error?: FieldError;
  containerClassName?: string;
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
  loadingDocuments?: { id: string; typeLabel: string }[];
  disabled?: boolean;
  handleSubmit?: (e?: React.BaseSyntheticEvent) => Promise<void>;
  modelSelector?: React.ReactNode;
  leftAddon?: React.ReactNode;
  leftAddonPosition?: 'center' | 'bottom';
  onPasteIntercept?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  charLimit?: number;
} & ComponentPropsWithRef<'textarea'>;

function CharCounter({ count, limit }: { count: number; limit: number }) {
  const ratio = count / limit;
  const isPill = ratio >= 0.9;

  let colorClass: string;
  let opacityClass: string;
  let bgClass: string;

  if (ratio > 1) {
    colorClass = 'text-rose-400';
    opacityClass = 'opacity-100';
    bgClass = 'bg-rose-500/10 px-1.5 py-0.5 rounded';
  } else if (ratio >= 0.9) {
    colorClass = 'text-amber-400';
    opacityClass = 'opacity-90';
    bgClass = 'bg-amber-500/8 px-1.5 py-0.5 rounded';
  } else if (ratio >= 0.8) {
    colorClass = 'text-zinc-400 dark:text-zinc-400';
    opacityClass = 'opacity-70';
    bgClass = '';
  } else {
    colorClass = 'text-zinc-500 dark:text-zinc-600';
    opacityClass = 'opacity-40';
    bgClass = '';
  }

  return (
    <span
      className={`text-[11px] tabular-nums font-mono tracking-tight transition-all duration-300 ${colorClass} ${opacityClass} ${isPill ? bgClass : ''}`}
    >
      {count} / {limit}
    </span>
  );
}

export const Textarea = forwardRef(
  (
    {
      label,
      hint,
      error,
      errorMessage,
      className,
      disabled,
      showVoiceInput = true,
      showArrowIcon = true,
      showFileAttachment = false,
      onFileIconClick,
      onFilesDrop,
      threadDocuments = [],
      onThreadDocumentRemove,
      loadingDocuments = [],
      containerClassName,
      mandatory = false,
      maxHeight = 200,
      onSend,
      setValue,
      value,
      handleSubmit,
      modelSelector,
      leftAddon,
      leftAddonPosition = 'center',
      onPasteIntercept,
      charLimit,
      ...rest
    }: Props,
    ref: ForwardedRef<HTMLTextAreaElement>,
  ) => {
    const {
      onKeyDown: outerOnKeyDown,
      onInput: outerOnInput,
      ...restWithoutHandlers
    } = rest;

    const id = useId();
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const setValueRef = useRef(setValue);
    // Text that existed before recording started — preserved as prefix
    const prefixTextRef = useRef('');
    const t = useTranslations('text-area');
    const [isDragOver, setIsDragOver] = useState(false);

    useEffect(() => {
      setValueRef.current = setValue;
    }, [setValue]);

    const applyValue = useCallback((newValue: string) => {
      if (setValueRef.current) {
        setValueRef.current(newValue);
      } else if (textareaRef.current) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          'value',
        )?.set;
        nativeInputValueSetter?.call(textareaRef.current, newValue);
        textareaRef.current.dispatchEvent(
          new Event('input', { bubbles: true }),
        );
      }
    }, []);

    const {
      startListening,
      stopListening,
      isRecording,
      error: voiceError,
    } = useVoiceInput({
      onRecordingStart: () => {
        // Snapshot current text as prefix
        prefixTextRef.current = value?.trim() || '';
      },
      onTranscription: (fullText) => {
        const prefix = prefixTextRef.current;
        const newValue = prefix ? `${prefix} ${fullText}` : fullText;
        applyValue(newValue);
      },
    });

    const handleStartListening = () => {
      startListening();
    };

    const adjustHeight = () => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(
          textarea.scrollHeight,
          maxHeight,
        )}px`;
      }
    };

    useEffect(() => {
      if (value !== undefined) {
        adjustHeight();
      }
    }, [value]);

    const sendAction = onSend ?? handleSubmit;

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendAction?.();
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

    const attachmentIcon = showFileAttachment ? (
      <PlusIcon
        className={classMerge(
          'size-5',
          'text-foreground/70 hover:text-foreground cursor-pointer transition-colors',
        )}
        aria-hidden="true"
      />
    ) : null;

    // Send button (arrow icon)
    let sendIcon = null;
    let sendOnClick: (() => void) | undefined = undefined;

    if (showArrowIcon) {
      const hasText = !!value?.trim();
      sendIcon = (
        <ArrowRightCircleIcon
          className={classMerge(
            'size-7',
            (() => {
              if (hasText && disabled) {
                return 'text-gray-300 dark:text-gray-600';
              }
              if (hasText) {
                return 'text-ragen-blue dark:text-gray-200 hover:text-ragen-blue/80 dark:hover:text-gray-300';
              }
              return 'text-gray-300 dark:text-gray-600';
            })(),
          )}
          aria-hidden="true"
        />
      );
      sendOnClick = hasText && !disabled ? sendAction : undefined;
    }

    // Voice/mic button (separate from send)
    let voiceIcon = null;
    let voiceOnClick: (() => void) | undefined = undefined;

    if (showVoiceInput) {
      if (isRecording) {
        voiceIcon = (
          <div className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors">
            <div className="flex items-end gap-[3px] h-5">
              {[...Array(5)].map((_, i) => (
                <span
                  key={i}
                  className="w-[3px] rounded-full bg-red-500 dark:bg-red-400"
                  style={{
                    height: '6px',
                    animation: `voice-wave 0.5s ease-in-out ${i * 0.1}s infinite alternate`,
                  }}
                />
              ))}
            </div>
            <StopIcon
              className="size-4 text-red-500 dark:text-red-400"
              aria-hidden="true"
            />
          </div>
        );
        voiceOnClick = stopListening;
      } else if (disabled && !value?.trim()) {
        voiceIcon = <SpinnerSVG aria-hidden="true" />;
      } else {
        voiceIcon = (
          <MicrophoneIcon
            className={classMerge(
              'size-5',
              'text-foreground/70 hover:text-foreground transition-colors',
            )}
            aria-hidden="true"
          />
        );
        voiceOnClick = handleStartListening;
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
            className={classMerge(
              'relative rounded-xl border transition-colors dark:bg-secondary-dark',
              (() => {
                if (isDragOver) {
                  return 'border-2 border-blue-400 dark:border-blue-500';
                }
                if (error) {
                  return 'border-red-300';
                }
                if (disabled) {
                  return 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50';
                }
                return 'border-gray-300 dark:border-gray-800';
              })(),
              !error && 'shadow-xs',
            )}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            {/* Attached documents (inside the input container) */}
            {(threadDocuments.length > 0 || loadingDocuments.length > 0) && (
              <div className="flex flex-wrap gap-2 px-3 pt-3">
                {threadDocuments.map((document, index) => (
                  <FileBadge
                    key={`${document.name}-${index}`}
                    document={document}
                    onRemove={() => onThreadDocumentRemove?.(index)}
                  />
                ))}
                {loadingDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className="relative flex flex-col gap-2 w-40 rounded-xl border border-border bg-background p-3 animate-pulse"
                  >
                    <div className="h-4 w-24 rounded bg-muted" />
                    <div className="h-3 w-16 rounded bg-muted" />
                    <span className="inline-flex items-center gap-1 self-start rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                      <DocumentTextIcon className="size-3 text-blue-500" />
                      {doc.typeLabel}
                    </span>
                  </div>
                ))}
              </div>
            )}

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
                'block w-full bg-transparent dark:text-gray-300 rounded-md border-0 py-3 text-gray-900 placeholder:text-gray-600 dark:placeholder:text-gray-500 sm:text-sm sm:leading-6 focus:ring-0 focus:outline-hidden resize-none overflow-y-auto min-h-[50px]',
                maxHeightClass,
                {
                  'text-red-900 placeholder:text-red-300': error,
                },
                'pl-3 pr-3',
              )}
              {...restWithoutHandlers}
              onInput={(e) => {
                outerOnInput?.(e);
                adjustHeight();
              }}
              onKeyDown={(e) => {
                outerOnKeyDown?.(e);
                if (!e.defaultPrevented) {
                  handleKeyDown(e);
                }
              }}
              onPaste={(e) => {
                onPasteIntercept?.(e);
              }}
              value={value}
              placeholder={t('placeholder')}
            />

            {isDragOver && (
              <div className="absolute inset-0 flex items-center justify-center bg-blue-100/80 dark:bg-blue-900/40 rounded-md pointer-events-none">
                <div className="flex flex-col items-center text-blue-600 dark:text-blue-400">
                  <CloudArrowUpIcon className="h-8 w-8 mb-2" />
                  <span className="text-sm font-medium">Drop files here</span>
                </div>
              </div>
            )}

            {/* Bottom bar: left addon / attachment + model selector + voice + send */}
            {(leftAddon ||
              attachmentIcon ||
              modelSelector ||
              voiceIcon ||
              sendIcon ||
              charLimit) && (
              <div className="flex items-center justify-between px-3 pb-2 pt-0">
                <div className="flex items-center">
                  {leftAddon && !attachmentIcon && leftAddon}
                  {attachmentIcon && (
                    <button
                      type="button"
                      onClick={onFileIconClick || handleFileIconClick}
                      className="flex items-center"
                    >
                      {attachmentIcon}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {charLimit &&
                    value !== undefined &&
                    value.length / charLimit >= 0.8 && (
                      <CharCounter count={value.length} limit={charLimit} />
                    )}
                  {modelSelector}
                  {voiceIcon && (
                    <button
                      type="button"
                      onClick={voiceOnClick}
                      className="flex items-center"
                    >
                      {voiceIcon}
                    </button>
                  )}
                  {sendIcon && !isRecording && (
                    <button
                      type="button"
                      onClick={sendOnClick}
                      className="flex items-center"
                    >
                      {sendIcon}
                    </button>
                  )}
                </div>
              </div>
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
  },
);

Textarea.displayName = 'Textarea';
