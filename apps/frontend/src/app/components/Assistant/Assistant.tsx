'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { StatusCodes } from 'http-status-codes';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';

import { ChatOutput } from './ChatOutput';
import { PromptForm } from './PromptForm';
import { CreateMessageDto, MessageDto } from '../../contracts/Message';
import {
  fetchMessagesFromApi,
  runAssistant,
  sendMessage,
} from '../../lib/services/api';
import { LOCAL_STORAGE_THREAD_KEY } from '../config';

type Props = {
  threadId: string;
};

export const Assistant = ({ threadId }: Props) => {
  const [isMessageLoading, setMessageIsLoading] = useState(false);
  const [messageLoadingText, setMessageLoadingText] = useState('');
  const [isMessageError, setMessageIsError] = useState(false);
  const [messageError, setMessageError] = useState(false);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const { push } = useRouter();
  const locale = useLocale();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['messages', { threadId }],
    queryFn: fetchMessagesFromApi,
  });
  const t = useTranslations('Index');

  const initialMessages = data ? data.data : [];
  const isGlobalLoading = isLoading || isMessageLoading;

  useEffect(() => {
    const localStorageThreadId = localStorage.getItem(LOCAL_STORAGE_THREAD_KEY);
    if (!localStorageThreadId) {
      localStorage.setItem(LOCAL_STORAGE_THREAD_KEY, threadId);
    }
  }, []);

  useEffect(() => {
    const eventSource = new EventSource(
      `http://localhost:4000/api/threads/${threadId}/sse`
    );
    // const eventSource = new EventSource(`/api/threads/${threadId}/sse`);
    eventSource.onmessage = (event) => {
      const eventMessage = JSON.parse(event.data);
      if (eventMessage) {
        // TODO: add message to messages instead of revalidate
        // refetch(); // TODO: uncomment
        setMessageIsLoading(false);
      }
    };
    // eventSource.addEventListener('message', (e) => {
    //   // the event name here must be the same as in the API
    //   const eventMessage = JSON.parse(e.data);
    //   if (eventMessage) {
    //     // TODO: add message to messages instead of revalidate
    //     refetch();
    //     setMessageIsLoading(false);
    //   }

    //   // console.log('event data: ', JSON.parse(e.data));
    // });
    eventSource.addEventListener('open', (e) => {
      // console.log('open', e);
    });
    eventSource.addEventListener('error', (e) => {
      eventSource.close();
    });

    return () => {
      eventSource.close();
    };
  }, []);

  const handleCloseThread = () => {
    localStorage.removeItem(LOCAL_STORAGE_THREAD_KEY);
    push(`/${locale}`);
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

      // TODO: move to backend event in background
      runAssistant(threadId);

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
      </div>
    </div>
  );
};
