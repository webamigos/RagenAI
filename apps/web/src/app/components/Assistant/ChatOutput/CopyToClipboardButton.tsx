'use client';

import { memo, useState, useRef, useEffect } from 'react';
import { DocumentDuplicateIcon, CheckIcon } from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';
import { DropdownMenu } from 'radix-ui';
import { Tooltip } from '@ragenai/common-ui/Tooltip';
import { statusToast } from '@/app/lib/utils/toast';
import { type MessageDto } from '@/features/messages/contracts/message.types';

const ACTION_BUTTON_CLS =
  'inline-flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors';

const DROPDOWN_ITEM_CLS =
  'flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground';

type CopyToClipboardButtonProps = {
  message: MessageDto;
  htmlContent?: string;
  className?: string;
};

const htmlToPlainText = (html: string): string => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.innerText || div.textContent || '';
};

export const CopyToClipboardButton = memo(
  ({ message, htmlContent, className }: CopyToClipboardButtonProps) => {
    const [copied, setCopied] = useState(false);
    const { successToast } = statusToast();
    const t = useTranslations('success-toast');
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }, []);

    const onSuccess = () => {
      setCopied(true);
      successToast({ message: t('copied') });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    };

    const copyFormattedText = () => {
      if (!htmlContent) {
        navigator.clipboard
          .writeText(message.content)
          .then(onSuccess)
          .catch(() => {});
        return;
      }
      const plainText = htmlToPlainText(htmlContent);
      navigator.clipboard
        .write([
          new ClipboardItem({
            'text/html': new Blob([htmlContent], { type: 'text/html' }),
            'text/plain': new Blob([plainText], { type: 'text/plain' }),
          }),
        ])
        .then(onSuccess)
        .catch(() => {
          navigator.clipboard
            .writeText(plainText)
            .then(onSuccess)
            .catch(() => {});
        });
    };

    const copyMarkdown = () => {
      const normalized = message.content.replace(/^(\s*)\* /gm, '$1- ');
      navigator.clipboard
        .writeText(normalized)
        .then(onSuccess)
        .catch(() => {});
    };

    return (
      <span className={`inline-flex items-center ${className ?? ''}`}>
        <Tooltip id={`copy-${message.id}`} content={t('copy-options')}>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                aria-label={t('copy-options')}
                data-testid="copy-trigger-btn"
                className={ACTION_BUTTON_CLS}
              >
                {copied ? (
                  <CheckIcon className="size-4 text-ready" />
                ) : (
                  <DocumentDuplicateIcon className="size-4" />
                )}
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="z-50 min-w-[140px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
                sideOffset={6}
                align="start"
              >
                <DropdownMenu.Item
                  data-testid="copy-text-item"
                  className={DROPDOWN_ITEM_CLS}
                  onSelect={copyFormattedText}
                >
                  {t('copy-text')}
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  data-testid="copy-markdown-item"
                  className={DROPDOWN_ITEM_CLS}
                  onSelect={copyMarkdown}
                >
                  {t('copy-markdown')}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </Tooltip>
      </span>
    );
  },
);

CopyToClipboardButton.displayName = 'CopyToClipboardButton';
