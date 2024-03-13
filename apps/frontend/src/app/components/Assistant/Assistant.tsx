'use client';

import { useState } from 'react';
import axios from 'axios';
import markdownit from 'markdown-it';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@salesyy/common-ui';

import { ChatOutput } from './ChatOutput';
import { PromptForm } from './PromptForm';
import { CreateThreadDto } from '../../api/threads/route';
import { MessageDto } from '../../contracts/MessageDto';
import { fetchMessagesFromApi } from '../../lib/services/message';
import { ThreadDto } from '../../contracts/ThreadDto';

const LOCAL_STORAGE_THREAD_KEY = 'salesyy_thread_id';
const ASSISTANT_NAME = 'SalesYY';
const USER_NAME = 'You';

export type Message = {
  role: string;
  content: string;
};

export const Assistant = () => {
  const [threadId, setThreadId] = useState(() => {
    if (typeof window !== 'undefined') {
      const localThreadId = localStorage.getItem(LOCAL_STORAGE_THREAD_KEY);
      return localThreadId ? localThreadId : '';
    }
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['messages'],
    queryFn: (publicThreadId: ThreadDto['public_id']) =>
      fetchMessagesFromApi(publicThreadId),
  });
  console.log({ data, isLoading, isError });

  const handleNewThread = async () => {
    try {
      const result = await axios.post<CreateThreadDto>('/api/threads');
      const threadId = result.data.public_id;
      setThreadId(threadId);
      localStorage.setItem(LOCAL_STORAGE_THREAD_KEY, threadId);
      console.log(threadId);
    } catch {
      // TODO: implement
    }
  };

  const onSubmit = async (data: MessageDto) => {
    console.log('in client: ', data);
    // const serverResult = await serverAction(data);

    const message: Message = { role: USER_NAME, content: data.prompt };

    setMessages([...messages, message]);

    console.log({ threadId });
    const result = await axios.post(`/api/threads/${threadId}/messages`, data);
    console.log('result: ', result.data.message);

    const md = markdownit();

    setMessages(() => [
      ...messages,
      message,
      {
        role: ASSISTANT_NAME,
        content: md.render(result.data.message),
      },
    ]);
  };

  return (
    <div className="container mx-auto">
      <p>Thread id: {threadId}</p>

      <ChatOutput messages={messages} />
      {threadId && <PromptForm onSubmit={onSubmit} />}

      {!threadId && (
        <Button label="Start new thread" onClick={handleNewThread} />
      )}
    </div>
  );
};
