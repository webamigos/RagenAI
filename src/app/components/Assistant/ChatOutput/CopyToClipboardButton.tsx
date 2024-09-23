import { useState } from 'react';

import { Clipboard, ClipboardChecked } from '@salesyy/common-ui/icons';
import { MessageDto } from '@/app/contracts/Message';
import { useTranslations } from 'next-intl';

type CopyToClipboardButtonProps = {
  message: MessageDto;
  className: string;
  successToast: (message: string) => void;
};

export const CopyToClipboardButton = ({
  message,
  className,
  successToast,
}: CopyToClipboardButtonProps) => {
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const t = useTranslations('toast');

  const copyToClipboard = (text: string, messageId: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMessageId(messageId);
      successToast(t('copied'));
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
