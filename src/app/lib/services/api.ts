import { MessageDto } from '../../contracts/Message';
import { api } from './config';
import { CreateThreadDto } from '../../contracts/ThreadDto';
import { logger } from '../utils/logger';

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

export const submitFeedback = async (
  messageId: string,
  feedback: 'up' | 'down',
  runId: string
) => {
  return api.post(`/messages/feedback/${messageId}`, { feedback, runId });
};

// export const runAssistant = async (threadId: string) => {
//   return api.post<void>(`/assistant/${threadId}`);
// };

export const createThreadForGuest = () => {
  return api.post<CreateThreadDto>(`/guest-threads/`);
};

export const checkVisitorVisits = async (visitorId: string) => {
  return api.get<{ messages: number }>(`/visitor/${visitorId}`);
};

export const clearVisitorMessagesStats = async () => {
  return api.post<void>(`/visitor/hejho`);
};

export const uploadFiles = async (uploaderId: string, data: FormData) => {
  return api.post<void>(`/upload/${uploaderId}`, data, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

export const deleteFile = async (uploaderId: string, documentId: string) => {
  const url = process.env.NEXT_PUBLIC_API_URL;
  const fullUrl = `${url}/api/upload/${uploaderId}/${documentId}`;
  return await api.delete<void>(fullUrl);
};

export const fetchSettings = async () => {
  const { data } = await api.get<{ temperature: number; model: string }>(
    `/settings`
  );
  return data;
};

export const updateTemperatureSettings = async (temperature: number) => {
  const response = await api.put<{ temperature: number }>(
    `/settings/temperature`,
    {
      temperature,
    }
  );
  return { data: response.data, status: response.status };
};

export const updateModelSettings = async (model: string) => {
  const response = await api.put<{ model: string }>(`/settings/model`, {
    model,
  });
  return { data: response.data, status: response.status };
};
