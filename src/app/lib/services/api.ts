import { api } from './config';
import { type MessagesWithContext } from '@/features/threads/contracts/thread.types';
import { logger } from '@/app/lib/utils/logger';

export const fetchMessagesFromApi = async (
  threadId: string,
  visitorId: string,
) => {
  if (!threadId) {
    return undefined;
  }
  return api.get<MessagesWithContext>(`/messages/${threadId}/${visitorId}`);
};

export const fetchProject = async (projectId: string) => {
  try {
    const response = await fetch(`/api/projects/${projectId}`);
    if (!response.ok) {
      throw new Error('Failed to fetch project');
    }
    return await response.json();
  } catch (error) {
    logger.error({ err: error }, 'Error fetching project:');
    throw error;
  }
};

export const submitFeedback = async (
  messageId: string,
  feedback: 'up' | 'down',
  runId: string,
) => {
  return api.post(`/messages/feedback/${messageId}`, { feedback, runId });
};

export const checkVisitorVisits = async (visitorId: string) => {
  return api.get<{ messages: number }>(`/visitor/${visitorId}`);
};

export const clearVisitorMessagesStats = async () => {
  return api.post<void>(`/visitor/hejho`);
};

type UploadedFile = {
  fileName: string;
  fileSize: number;
  uniqueFileId: string;
  content: string;
  projectId: number;
};

type UploadResponse = {
  message: string;
  status: number;
  files: UploadedFile[];
};

export const uploadProjectFiles = async (
  projectId: string,
  data: FormData,
): Promise<UploadResponse> => {
  const response = await api.post<UploadResponse>(`/upload`, data, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const uploadFiles = async (data: FormData): Promise<UploadResponse> => {
  const response = await api.post<UploadResponse>(`/upload`, data, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

type SupportRequestPayload = {
  title: string;
  message: string;
  file?: File[];
};

type SupportResponse = {
  message: string;
  status: number;
};

export const sendSupportRequest = async (
  data: SupportRequestPayload,
  file?: File,
): Promise<SupportResponse> => {
  const formData = new FormData();
  formData.append('type', 'contact');
  formData.append('title', data.title);
  formData.append('message', data.message);

  if (file) {
    if (Array.isArray(file)) {
      for (const f of file) {
        formData.append('files', f);
      }
    } else {
      formData.append('file', file);
    }
  }

  const response = await api.post<SupportResponse>('/send', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data;
};

export const fetchPublicProject = async (accessToken: string) => {
  const response = await fetch(`/api/projects/public/${accessToken}`);
  if (!response.ok) {
    throw new Error('Failed to fetch public project');
  }
  return response.json();
};
