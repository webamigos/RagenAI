import { MessageDto } from '../../contracts/Message';
import { api } from './config';
import { CreateThreadDto } from '../../contracts/ThreadDto';

export const fetchMessagesFromApi = async (threadId: string) => {
  if (!threadId) {
    return undefined;
  }
  return api.get<MessageDto[]>(`/threads/${threadId}/messages`);
};

export const createThread = () => {
  return api.post<CreateThreadDto>('/threads');
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
