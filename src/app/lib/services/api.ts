import { api } from './config';
import { MessageDto } from '../../contracts/Message';

export const fetchMessagesFromApi = async (
  threadId: string,
  visitorId: string
) => {
  if (!threadId) {
    return undefined;
  }
  return api.get<MessageDto[]>(`/messages/${threadId}/${visitorId}`);
};

export const submitFeedback = async (
  messageId: string,
  feedback: 'up' | 'down',
  runId: string
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
};

type UploadResponse = {
  message: string;
  status: number;
  files: UploadedFile[];
};

export const uploadProjectFiles = async (
  projectPublicId: string,
  data: FormData
): Promise<UploadResponse> => {
  const response = await api.post<UploadResponse>(
    `/upload/project/${projectPublicId}`,
    data,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );
  return response.data;
};

export const uploadFiles = async (
  uploaderId: string,
  data: FormData
): Promise<UploadResponse> => {
  const response = await api.post<UploadResponse>(
    `/upload/${uploaderId}`,
    data,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );
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
  file?: File
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
