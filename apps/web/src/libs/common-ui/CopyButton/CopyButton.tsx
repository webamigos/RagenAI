'use client';

import { memo, useState, type ButtonHTMLAttributes } from 'react';
import { Clipboard, ClipboardChecked } from '@ragenai/common-ui/icons';
import { useTranslations } from 'next-intl';
import { statusToast } from '@/app/lib/utils/toast';

import { classMerge } from '@ragenai/common-ui/utils/cn';

type CopyButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  textToCopy: string;
  htmlToCopy?: string;
  showToast?: boolean;
};

export const CopyButton = memo(
  ({
    textToCopy,
    htmlToCopy,
    className,
    showToast = true,
    ...props
  }: CopyButtonProps) => {
    const [isCopied, setIsCopied] = useState(false);
    const { successToast } = statusToast();
    const t = useTranslations('success-toast');

    const copyToClipboard = () => {
      const onSuccess = () => {
        setIsCopied(true);
        if (showToast) {
          successToast({ message: t('copied') });
        }
        setTimeout(() => setIsCopied(false), 2000);
      };

      if (htmlToCopy) {
        navigator.clipboard
          .write([
            new ClipboardItem({
              'text/html': new Blob([htmlToCopy], { type: 'text/html' }),
              'text/plain': new Blob([textToCopy], { type: 'text/plain' }),
            }),
          ])
          .then(onSuccess);
      } else {
        navigator.clipboard.writeText(textToCopy).then(onSuccess);
      }
    };

    return (
      <button
        onClick={copyToClipboard}
        className={classMerge(className)}
        {...props}
      >
        {isCopied ? (
          <ClipboardChecked className="text-brand-500" />
        ) : (
          <Clipboard />
        )}
      </button>
    );
  },
);

CopyButton.displayName = 'CopyButton';
