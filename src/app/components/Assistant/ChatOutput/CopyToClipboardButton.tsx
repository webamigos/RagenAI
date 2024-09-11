import { useState } from 'react';

import { Clipboard, ClipboardChecked } from '@salesyy/common-ui/icons';
import { MessageDto } from '@/app/contracts/Message';
import { useTranslations } from 'next-intl';

import { SuccessToast } from './SuccessToast';

type CopyToClipboardButtonProps = {
  message: MessageDto;
  className: string;
};

export const CopyToClipboardButton = ({
  message,
  className,
}: CopyToClipboardButtonProps) => {
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const t = useTranslations('toast');

  const copyToClipboard = (text: string, messageId: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMessageId(messageId);
      SuccessToast(t('copied'));
      setTimeout(() => setCopiedMessageId(null), 2000);
    });
  };

  return (
    <button
      onClick={() => copyToClipboard(message.content, message.public_id)}
      className={className}
    >
      {copiedMessageId === message.public_id ? (
        <ClipboardChecked />
      ) : (
        <Clipboard />
      )}
    </button>
  );
};
