import { memo } from 'react';
import { MessageDto } from '@/app/contracts/Message';
import { CopyButton } from '@ragenai/common-ui/CopyButton/CopyButton';

type CopyToClipboardButtonProps = {
  message: MessageDto;
  className?: string;
};

export const CopyToClipboardButton = memo(
  ({ message, className }: CopyToClipboardButtonProps) => {
    return <CopyButton textToCopy={message.content} className={className} />;
  }
);

CopyToClipboardButton.displayName = 'CopyToClipboardButton';
