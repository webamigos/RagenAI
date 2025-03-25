import { memo, useState, ButtonHTMLAttributes } from 'react';
import { Clipboard, ClipboardChecked } from '@ragenai/common-ui/icons';
import { useTranslations } from 'next-intl';
import { statusToast } from '@/app/lib/utils/toast';

import { classMerge } from '@ragenai/common-ui/utils/cn';

type CopyButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  textToCopy: string;
  showToast?: boolean;
};

export const CopyButton = memo(
  ({ textToCopy, className, showToast = true, ...props }: CopyButtonProps) => {
    const [isCopied, setIsCopied] = useState(false);
    const { successToast } = statusToast();
    const t = useTranslations('success-toast');

    const copyToClipboard = () => {
      navigator.clipboard.writeText(textToCopy).then(() => {
        setIsCopied(true);
        if (showToast) {
          successToast({ message: t('copied') });
        }
        setTimeout(() => setIsCopied(false), 2000);
      });
    };

    return (
      <button
        onClick={copyToClipboard}
        className={classMerge(className)}
        {...props}
      >
        {isCopied ? (
          <ClipboardChecked className="text-primary-blue-500" />
        ) : (
          <Clipboard />
        )}
      </button>
    );
  }
);

CopyButton.displayName = 'CopyButton';
