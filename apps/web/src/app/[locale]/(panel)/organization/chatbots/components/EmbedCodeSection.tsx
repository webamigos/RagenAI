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
        <h3 className="text-sm font-medium text-foreground">{t('title')}</h3>
        <p className="text-xs text-muted-foreground">{t('description')}</p>
      </div>
      <div className="relative rounded-md border border-border bg-muted dark:bg-card">
        <pre className="overflow-x-auto px-4 py-3 font-mono text-xs text-foreground">
          {snippet}
        </pre>
        <button
          onClick={handleCopy}
          className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-muted-foreground/90"
        >
          {copied ? (
            <CheckIcon className="size-4 text-ready" />
          ) : (
            <ClipboardIcon className="size-4" />
          )}
        </button>
      </div>
    </div>
  );
}
