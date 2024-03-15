import { Role, Message as MessageModel } from '@prisma/client';

import { CreateMessageDto, MessageDto } from '../../contracts/Message';
import { api } from './config';

type MessagesQueryKey = {
  queryKey: [string, { threadId: string }];
};

export const fetchMessagesFromApi = async ({ queryKey }: MessagesQueryKey) => {
  const [_key, { threadId }] = queryKey;
  if (!threadId) {
    return undefined;
  }
  return api.get<MessageDto[]>(`/threads/${threadId}/messages`);
};

export const sendMessage = (threadId: string, data: CreateMessageDto) => {
  return api.post<MessageDto>(`/threads/${threadId}/messages`, data);
};

export const runAssistant = async (threadId: string) => {
  return api.post<void>(`/assistant/${threadId}`);
};
