'use client';

import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
//import markdownit from 'markdown-it';
import { Role, Message as MessageModel } from '@prisma/client';

import { Button } from '@salesyy/common-ui';

import { ChatOutput } from './ChatOutput';
import { PromptForm } from './PromptForm';
import { CreateThreadDto } from '../../api/threads/route';
import { CreateMessageDto } from '../../contracts/MessageDto';
import { fetchMessagesFromApi, sendMessage } from '../../lib/services/api';
import { StatusCodes } from 'http-status-codes';
import { ThreadId } from './ThreadId/ThreadId';
import { api } from '../../lib/services/config';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

const LOCAL_STORAGE_THREAD_KEY = 'salesyy_thread_id';

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
  const [threadId, setThreadId] = useState('');
  const [isMessageLoading, setMessageIsLoading] = useState(false);
  const [messageLoadingText, setMessageLoadingText] = useState('');
  const [isMessageError, setMessageIsError] = useState(false);
  const [messageError, setMessageError] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['messages', { threadId: threadId || '' }],
    queryFn: fetchMessagesFromApi,
  });
  const t = useTranslations('Index');

  const initialMessages = data ? data.data.messages : [];
  const isGlobalLoading = isLoading || isMessageLoading;

  useEffect(() => {
    const localThreadId = localStorage.getItem(LOCAL_STORAGE_THREAD_KEY);
    setThreadId(localThreadId ? localThreadId : '');
  }, []);

  useEffect(() => {
    const eventSource = new EventSource('/api/sse');

    eventSource.addEventListener('salesyy-event', (e) => {
      // the event name here must be the same as in the API
      const eventMessage = JSON.parse(e.data);
      if (eventMessage) {
        // TODO: add message to messages instead of revalidate
        refetch();
        setMessageIsLoading(false);
      }

      // console.log('event data: ', JSON.parse(e.data));
    });
    eventSource.addEventListener('open', (e) => {
      console.log('open', e);
    });
    eventSource.addEventListener('error', (e) => {
      eventSource.close();
    });

    return () => {
      eventSource.close();
    };
  }, []);

  const handleNewThread = async () => {
    try {
      const result = await api.post<CreateThreadDto>('/threads');
      const threadId = result.data.public_id;
      setThreadId(threadId);
      localStorage.setItem(LOCAL_STORAGE_THREAD_KEY, threadId);
      // console.log(threadId);
    } catch {
      // TODO: implement
    }
  };

  const handleCloseThread = () => {
    localStorage.removeItem(LOCAL_STORAGE_THREAD_KEY);
    setThreadId('');
  };

  const onSubmit = async (data: CreateMessageDto) => {
    try {
      setMessageIsLoading(true);
      setMessageLoadingText('Thinking...');

      await sendMessage(threadId, data);
      setMessageLoadingText('Searching memories...');
      refetch();

      setMessageLoadingText('Beep, boop, robots are waking up...');
      setMessageLoadingText('Asking AI what it thinks about your question...');

      // run in background
      api.post<MessageResponse>(`/assistant/${threadId}`);
      // this will be streamed and then received by SSE

      setMessageLoadingText('Analyzing your question...');

      // refetch();
      // setMessageIsLoading(false);
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
      {/* {threadId && <ThreadId threadId={threadId} />} */}

      <div>
        <ChatOutput
          messages={initialMessages ? initialMessages : messages}
          isLoading={isGlobalLoading}
          loadingMessage={messageLoadingText}
        />
        {threadId && (
          <PromptForm
            handleCloseThread={handleCloseThread}
            isLoading={isGlobalLoading}
            onSubmit={onSubmit}
          />
        )}

        {!threadId && (
          <div className="mt-6 flex flex-col items-center">
            <Button
              label={t('start-new-thread')}
              className="bg-salesyy-red hover:bg-red-700 disabled:bg-red-400"
              onClick={handleNewThread}
              disabled={isGlobalLoading}
            />
          </div>
        )}
      </div>
    </div>
  );
};
