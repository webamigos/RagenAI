import { CreateMessageDto, MessageDto } from '../../contracts/Message';
import { api } from './config';
import { CreateThreadDto } from '../../contracts/ThreadDto';

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

export const createThread = () => {
  return api.post<CreateThreadDto>('/threads');
};

export const sendMessage = (threadId: string, data: CreateMessageDto) => {
  return api.post<MessageDto>(`/threads/${threadId}/messages`, data);
};

export const runAssistant = async (threadId: string) => {
  return api.post<void>(`/assistant/${threadId}`);
};

export const checkVisitorVisits = async (visitorId: string) => {
  return api.get<{ messages: number }>(`/visitor/${visitorId}`);
};

export const clearVisitorMessagesStats = async () => {
  return api.post<void>(`/visitor/hejho`);
};
