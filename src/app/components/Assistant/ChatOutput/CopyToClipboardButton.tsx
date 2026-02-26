import { memo } from 'react';
import { type MessageDto } from '@/features/messages/contracts/message.types';
import { CopyButton } from '@ragenai/common-ui/CopyButton/CopyButton';

type CopyToClipboardButtonProps = {
  message: MessageDto;
  htmlContent?: string;
  className?: string;
};

export const CopyToClipboardButton = memo(
  ({ message, htmlContent, className }: CopyToClipboardButtonProps) => {
    return (
      <CopyButton
        textToCopy={message.content}
        htmlToCopy={htmlContent}
        className={className}
      />
    );
  },
);

CopyToClipboardButton.displayName = 'CopyToClipboardButton';
