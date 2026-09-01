import type { MessageAttachment } from '@/features/messages/contracts/message.types';

export type RegenerateData = {
  prompt: string;
  attachments: MessageAttachment[];
};
