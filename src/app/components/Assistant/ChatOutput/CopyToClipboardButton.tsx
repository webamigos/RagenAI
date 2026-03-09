'use client';

import { memo, useState, useRef, useEffect } from 'react';
import {
  DocumentDuplicateIcon,
  CodeBracketIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';
import { statusToast } from '@/app/lib/utils/toast';
import { type MessageDto } from '@/features/messages/contracts/message.types';

type CopyToClipboardButtonProps = {
  message: MessageDto;
  htmlContent?: string;
  className?: string;
};

/**
 * Extract clean plain text from HTML — preserves structure (newlines, spacing)
 * but strips all markdown/HTML formatting.
 */
const htmlToPlainText = (html: string): string => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.innerText || div.textContent || '';
};

export const CopyToClipboardButton = memo(
  ({ message, htmlContent, className }: CopyToClipboardButtonProps) => {
    const [copiedType, setCopiedType] = useState<'text' | 'markdown' | null>(
      null,
    );
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

    const onSuccess = (type: 'text' | 'markdown') => {
      setCopiedType(type);
      successToast({ message: t('copied') });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => setCopiedType(null), 2000);
    };

    const copyFormattedText = () => {
      if (!htmlContent) {
        navigator.clipboard
          .writeText(message.content)
          .then(() => onSuccess('text'))
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
        .then(() => onSuccess('text'))
        .catch(() => {
          navigator.clipboard
            .writeText(plainText)
            .then(() => onSuccess('text'))
            .catch(() => {});
        });
    };

    const copyMarkdown = () => {
      const normalized = message.content.replace(/^(\s*)\* /gm, '$1- ');
      navigator.clipboard
        .writeText(normalized)
        .then(() => onSuccess('markdown'))
        .catch(() => {});
    };

    return (
      <span className={`inline-flex items-center gap-1 ${className ?? ''}`}>
        <button type="button" onClick={copyFormattedText} title="Copy">
          {copiedType === 'text' ? (
            <CheckIcon className="size-4 text-green-500" />
          ) : (
            <DocumentDuplicateIcon className="size-4" />
          )}
        </button>
        <button type="button" onClick={copyMarkdown} title="Copy as Markdown">
          {copiedType === 'markdown' ? (
            <CheckIcon className="size-4 text-green-500" />
          ) : (
            <CodeBracketIcon className="size-4" />
          )}
        </button>
      </span>
    );
  },
);

CopyToClipboardButton.displayName = 'CopyToClipboardButton';
