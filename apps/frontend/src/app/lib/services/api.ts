import { api } from './config';
import { Role, Message as MessageModel } from '@prisma/client';

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
  // if (!threadId) {
  //   return [] as MessageDto[];
  // }
  return api.get<MessageResponse>(`/threads/${threadId}/messages`);
};
