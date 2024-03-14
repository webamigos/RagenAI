'use client';

import { useEffect, useState } from 'react';
import axios, { AxiosError } from 'axios';
import markdownit from 'markdown-it';
import { useQuery } from '@tanstack/react-query';
import { Role, Message as MessageModel } from '@prisma/client';

import { Button } from '@salesyy/common-ui';

import { ChatOutput } from './ChatOutput';
import { PromptForm } from './PromptForm';
import { CreateThreadDto } from '../../api/threads/route';
import { MessageDto } from '../../contracts/MessageDto';
import { fetchMessagesFromApi } from '../../lib/services/message';
import { ThreadDto } from '../../contracts/ThreadDto';
import { StatusCodes } from 'http-status-codes';

const LOCAL_STORAGE_THREAD_KEY = 'salesyy_thread_id';
const ASSISTANT_NAME = 'SalesYY';
const USER_NAME = 'You';

export type Message = {
  role: Role;
  content: MessageModel['content'];
  created_at: MessageModel['created_at'];
  public_id: MessageModel['public_id'];
};

type MessageResponse = {
  message: Message;
};

export const Assistant = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [messageError, setMessageError] = useState(false);
  const [threadId, setThreadId] = useState(() => {
    if (typeof window !== 'undefined') {
      const localThreadId = localStorage.getItem(LOCAL_STORAGE_THREAD_KEY);
      return localThreadId ? localThreadId : '';
    }
  });
  const [messages, setMessages] = useState<Message[]>([]);
  // const { data, isLoading, isError } = useQuery({
  //   queryKey: ['messages', { threadId: threadId || '' }],
  //   queryFn: fetchMessagesFromApi,
  // });
  // console.log({ data, isLoading, isError });

  // useEffect(() => {
  //   const eventSource = new EventSource('/api/sse');

  //   eventSource.addEventListener('salesyy-event', (e) => {
  //     // the event name here must be the same as in the API
  //     console.log('event data: ', JSON.parse(e.data));
  //   });
  //   eventSource.addEventListener('open', (e) => {
  //     console.log('open', e);
  //   });
  //   eventSource.addEventListener('error', (e) => {
  //     eventSource.close();
  //   });

  //   // eventSource.onmessage = (event) => {
  //   //   console.log('event from sse: ', event);
  //   // };

  //   //   eventSource.onopen(() => {
  //   //     console.log('opened');
  //   //   });

  //   // eventSource.onerror((e) => {
  //   //   console.log('e');
  //   //   eventSource.close();
  //   // });

  //   return () => {
  //     eventSource.close();
  //   };
  // }, []);

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
    try {
      const result = await axios.post<MessageResponse>(
        `/api/threads/${threadId}/messages`,
        data
      );

      const messageResponse = result.data.message;
      console.log(result.status);

      const md = markdownit();

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          public_id: messageResponse.public_id,
          role: messageResponse.role,
          content: md.render(messageResponse.content),
          created_at: messageResponse.created_at,
        },
      ]);

      const assistantResult = await axios.post<MessageResponse>(
        `/api/assistant/${threadId}`
      );
      const assistantResponse = assistantResult.data.message;

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          public_id: assistantResponse.public_id,
          role: assistantResponse.role,
          content: md.render(assistantResponse.content),
          created_at: assistantResponse.created_at,
        },
      ]);
    } catch (error) {
      if (error instanceof AxiosError) {
        const errorStatus = error.status;
        if (errorStatus === StatusCodes.BAD_REQUEST) {
          setMessageError(true);
        }
      }
    }
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
