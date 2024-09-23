import { MessageDto } from '../../contracts/Message';
import { api } from './config';
import { CreateThreadDto } from '../../contracts/ThreadDto';

export const fetchMessagesFromApi = async (
  threadId: string,
  visitorId: string
) => {
  if (!threadId) {
    return undefined;
  }
  return api.get<MessageDto[]>(`/messages/${threadId}/${visitorId}`);
};

export const createThread = () => {
  return api.post<CreateThreadDto>('/threads');
};

export const createThreadForGuest = () => {
  return api.post<CreateThreadDto>(`/guest-threads/`);
};

export const checkVisitorVisits = async (visitorId: string) => {
  return api.get<{ messages: number }>(`/visitor/${visitorId}`);
};

export const clearVisitorMessagesStats = async () => {
  return api.post<void>(`/visitor/hejho`);
};
