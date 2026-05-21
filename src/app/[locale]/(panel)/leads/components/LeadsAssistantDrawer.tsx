'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat, type UIMessage } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useTranslations } from 'next-intl';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  XMarkIcon,
  PaperAirplaneIcon,
  SparklesIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { clsx } from 'clsx';

type Props = {
  open: boolean;
  onClose: () => void;
  leadListPublicId: string;
  listName: string;
  totalRows: number;
  selectedIds: string[];
};

function getText(message: UIMessage): string {
  if (!message.parts) {
    return '';
  }
  return message.parts
    .filter(
      (part): part is { type: 'text'; text: string } => part.type === 'text',
    )
    .map((p) => p.text)
    .join('');
}

export function LeadsAssistantDrawer({
  open,
  onClose,
  leadListPublicId,
  listName,
  totalRows,
  selectedIds,
}: Props) {
  const t = useTranslations('leads-page');
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Re-create the transport when selection changes so each request carries
  // the latest selectedIds in its body.
  const selectionKey = useMemo(
    () => selectedIds.slice().sort().join(','),
    [selectedIds],
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `/api/leads/${leadListPublicId}/chat`,
        body: { selectedIds },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leadListPublicId, selectionKey],
  );

  const { messages, sendMessage, status, error, stop, setMessages } = useChat({
    transport,
  });

  // Autoscroll to bottom on new messages / streaming.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Focus the input when drawer opens.
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    const text = input.trim();
    if (!text || status === 'streaming' || status === 'submitted') {
      return;
    }
    sendMessage({ text });
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isWorking = status === 'streaming' || status === 'submitted';
  const scopeLabel =
    selectedIds.length > 0
      ? t('assistant-scope-selection', { count: selectedIds.length })
      : t('assistant-scope-all', { count: totalRows });

  const suggestedPrompts = [
    t('assistant-suggested-1'),
    t('assistant-suggested-2'),
    t('assistant-suggested-3'),
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className={clsx(
          'fixed inset-0 z-40 bg-zinc-950/30 backdrop-blur-sm transition-opacity duration-200 dark:bg-zinc-950/60',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Drawer */}
      <aside
        role="dialog"
        aria-label={t('assistant-title')}
        aria-hidden={!open}
        className={clsx(
          'fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-2xl transition-transform duration-200 dark:border-zinc-800 dark:bg-zinc-950',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-white">
              <SparklesIcon className="size-4 text-violet-500" />
              {t('assistant-title')}
            </h2>
            <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
              {listName} · {scopeLabel}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => setMessages([])}
                className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                aria-label={t('assistant-clear')}
                title={t('assistant-clear')}
              >
                <ArrowPathIcon className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              aria-label={t('assistant-close')}
            >
              <XMarkIcon className="size-4" />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
        >
          {messages.length === 0 ? (
            <EmptyState
              prompts={suggestedPrompts}
              onPick={(p) => {
                setInput(p);
                inputRef.current?.focus();
              }}
              emptyText={t('assistant-empty')}
            />
          ) : (
            <div className="space-y-4">
              {messages.map((m) => (
                <MessageBubble key={m.id} role={m.role} text={getText(m)} />
              ))}
              {isWorking && (
                <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <ArrowPathIcon className="size-3 animate-spin" />
                  {t('assistant-thinking')}
                </div>
              )}
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                  {t('assistant-error')}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={handleSubmit}
          className="border-t border-zinc-200 p-3 dark:border-zinc-800"
        >
          <div className="flex items-end gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 focus-within:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:focus-within:border-zinc-500">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('assistant-placeholder')}
              rows={1}
              className="min-h-[20px] max-h-32 flex-1 resize-none bg-transparent text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none dark:text-zinc-100 dark:placeholder-zinc-600"
              disabled={isWorking}
            />
            {isWorking ? (
              <button
                type="button"
                onClick={stop}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                aria-label={t('assistant-stop')}
              >
                <div className="size-2.5 rounded-sm bg-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-zinc-900 text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                aria-label={t('assistant-send')}
              >
                <PaperAirplaneIcon className="size-3.5" />
              </button>
            )}
          </div>
        </form>
      </aside>
    </>
  );
}

function MessageBubble({
  role,
  text,
}: {
  role: 'user' | 'assistant' | 'system';
  text: string;
}) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
          <p className="whitespace-pre-wrap">{text}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="prose prose-sm dark:prose-invert max-w-[90%] text-sm text-zinc-800 dark:text-zinc-200">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    </div>
  );
}

function EmptyState({
  prompts,
  onPick,
  emptyText,
}: {
  prompts: string[];
  onPick: (p: string) => void;
  emptyText: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-2 py-8 text-center">
      <SparklesIcon className="size-8 text-violet-400" />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{emptyText}</p>
      <div className="flex w-full flex-col gap-1.5">
        {prompts.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
