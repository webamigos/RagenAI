'use client';

import { useRouter } from 'next/navigation';
import { MouseEventHandler, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { StatusCodes } from 'http-status-codes';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';

import { ChatOutput } from './ChatOutput';
import { PromptForm } from './PromptForm';
import { CreateMessageDto, MessageDto } from '../../contracts/Message';
import { fetchMessagesFromApi, runAssistant } from '../../lib/services/api';
import { LOCAL_STORAGE_THREAD_KEY } from '../config';
import { sendMessage } from '../../actions';

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

  // Function to take care of initial connect to the SSE API
  // Also, it reconnects to the SSE API as soon as it shuts down
  // This keeps the connection alive - forever with micro second delays
  const connectToStream = () => {
    const eventSource = new EventSource(`/api/threads/${threadId}/sse`);
    eventSource.addEventListener('message', (event) => {
      const eventMessage = JSON.parse(event.data);
      if (eventMessage) {
        // TODO: add message to messages instead of revalidate
        if (!(eventMessage.type && eventMessage.type === 'init')) {
          refetch();
          setMessageIsLoading(false);
        }
      }
    });

    // In case of any error, close the event source
    // So that it attempts to connect again
    eventSource.addEventListener('error', () => {
      eventSource.close();
      setTimeout(connectToStream, 1);
    });

    // As soon as SSE API source is closed, attempt to reconnect

    // @ts-ignore
    eventSource.onclose = () => {
      setTimeout(connectToStream, 1);
    };
    return eventSource;
  };

  useEffect(() => {
    // Initiate the first call to connect to SSE API
    const eventSource = connectToStream();
    // As the component unmounts, close listener to SSE API
    return () => {
      eventSource.close();
    };
  }, []);

  const handleCloseThread: MouseEventHandler<HTMLButtonElement> = (event) => {
    event.preventDefault();
    localStorage.removeItem(LOCAL_STORAGE_THREAD_KEY);
    push(`/${locale}`);
  };

  const onSubmit = async (data: CreateMessageDto) => {
    try {
      setMessageIsLoading(true);
      setMessageLoadingText('Thinking...');

      const messageResponse = await sendMessage(threadId, data);

      if (messageResponse.status === StatusCodes.BAD_REQUEST) {
        setMessageError(true);
        return;
      } else if (messageResponse.status === StatusCodes.CREATED) {
        setMessageLoadingText('Searching memories...');
        // TODO: instead refetch mutate data
        refetch();
      }

      setMessageLoadingText('Beep, boop, robots are waking up...');
      setMessageLoadingText('Asking AI what it thinks about your question...');

      // TODO: vercel doesn't like to run this as server action
      runAssistant(threadId);

      // on vercel this is not working good
      // const assistantResponse = await runAssistant(threadId);
      // if (assistantResponse.status === StatusCodes.OK) {
      //   setMessageLoadingText('Analyzing your question...');
      // } else {
      //   setMessageError(true);
      // }
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
    <>
      {/* {threadId && <ThreadId threadId={threadId} />} */}

      <div className="flex-grow overflow-y-auto">
        <ChatOutput
          messages={initialMessages ? initialMessages : messages}
          isLoading={isGlobalLoading}
          loadingMessage={messageLoadingText}
        />
      </div>

      {threadId && (
        <PromptForm
          handleCloseThread={handleCloseThread}
          isLoading={isGlobalLoading}
          onSubmit={onSubmit}
        />
      )}
    </>
  );
};
