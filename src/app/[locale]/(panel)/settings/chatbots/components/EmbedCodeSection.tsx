'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { ClipboardIcon, CheckIcon } from '@heroicons/react/24/outline';
import { logger } from '@/app/lib/utils/logger';

type EmbedCodeSectionProps = {
  widgetToken: string;
};

export function EmbedCodeSection({ widgetToken }: EmbedCodeSectionProps) {
  const t = useTranslations('settings-page.chatbots.embed');
  const [copied, setCopied] = useState(false);
  const mountedRef = useRef(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const appUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_APP_URL ?? '');

  const snippet = `<script\n  src="${appUrl}/chatbot-widget.js"\n  data-chatbot-token="${widgetToken}"\n  async\n></script>`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      if (mountedRef.current) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        setCopied(true);
        timeoutRef.current = setTimeout(() => {
          if (mountedRef.current) {
            setCopied(false);
          }
        }, 2000);
      }
    } catch (err) {
      logger.error({ err }, 'Failed to copy embed snippet to clipboard');
    }
  };

  return (
    <div className="space-y-2">
      <div className="space-y-0.5">
        <h3 className="text-sm font-medium text-zinc-950 dark:text-white">
          {t('title')}
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {t('description')}
        </p>
      </div>
      <div className="relative rounded-md border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
        <pre className="overflow-x-auto px-4 py-3 font-mono text-xs text-zinc-800 dark:text-zinc-200">
          {snippet}
        </pre>
        <button
          onClick={handleCopy}
          className="absolute right-2 top-2 rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          {copied ? (
            <CheckIcon className="size-4 text-green-500" />
          ) : (
            <ClipboardIcon className="size-4" />
          )}
        </button>
      </div>
    </div>
  );
}
