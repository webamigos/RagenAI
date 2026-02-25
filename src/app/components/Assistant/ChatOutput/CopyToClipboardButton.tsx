import { memo } from 'react';
import { MessageDto } from '@/features/messages/contracts/message.types';
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
