import { Role, Message as MessageModel } from '@prisma/client';

import { CreateMessageDto } from '../../contracts/Message';
import { api } from './config';

// TODO: duplication in Assistant.tsx
type Message = {
  role: Role;
  content: MessageModel['content'];
  created_at: MessageModel['created_at'];
  public_id: MessageModel['public_id'];
};

type MessageResponse = {
  messages: Message[];
};

type MessagesQueryKey = {
  queryKey: [string, { threadId: string }];
};

export const fetchMessagesFromApi = async ({ queryKey }: MessagesQueryKey) => {
  const [_key, { threadId }] = queryKey;
  if (!threadId) {
    return undefined;
  }
  return api.get<MessageResponse>(`/threads/${threadId}/messages`);
};

export const sendMessage = (threadId: string, data: CreateMessageDto) => {
  return api.post<MessageResponse>(`/threads/${threadId}/messages`, data);
};
