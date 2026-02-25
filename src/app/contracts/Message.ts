// @deprecated — Import message types from @/features/messages/contracts/message.types
// @deprecated — Import thread types from @/features/threads/contracts/thread.types
export {
  ChatType,
  ChatResponseType,
  createMessageSchema,
  type CreateMessageDto,
  type MessageDto,
  type ApiMessageDto,
  type MessageDtoWithoutPublicId,
  type StreamedMessageDto,
  type DbMessageDto,
} from '@/features/messages/contracts/message.types';

export {
  type ThreadHistoryResponse,
  type ProjectContext,
  type ThreadContext,
  type MessagesWithContext,
} from '@/features/threads/contracts/thread.types';

// Local type that wraps ThreadHistoryResponse
import type { ThreadHistoryResponse } from '@/features/threads/contracts/thread.types';

export type Thread = {
  thread: ThreadHistoryResponse[];
};
