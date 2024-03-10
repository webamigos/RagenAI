'use client';

import { useState } from 'react';
import axios from 'axios';
import { type SubmitHandler } from 'react-hook-form';

import { Button } from '@salesyy/common-ui';

import { ChatOutput } from './ChatOutput';
import { PromptForm } from './PromptForm';
import { CreateThreadDto } from '../../api/threads/route';
import { MessageDto } from '../../contracts/MessageDto';

const LOCAL_STORAGE_THREAD_KEY = 'salesyy_thread_id';
const ASSISTANT_NAME = 'SalesYY';

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

    const message: Message = { role: 'user', content: data.prompt };

    setMessages([...messages, message]);

    console.log({ threadId });
    const result = await axios.post(`/api/messages/${threadId}`, data);
    console.log('result: ', result.data.message);
    setMessages([
      ...messages,
      { role: ASSISTANT_NAME, content: result.data.message },
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
