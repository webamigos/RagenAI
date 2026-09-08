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

export const fetchPublicProject = async (accessToken: string) => {
  const response = await fetch(`/api/projects/public/${accessToken}`);
  if (!response.ok) {
    throw new Error('Failed to fetch public project');
  }
  return response.json();
};
