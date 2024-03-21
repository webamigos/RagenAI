'use client';

import { useRouter } from 'next/navigation';
import { MouseEventHandler, useEffect, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import { StatusCodes } from 'http-status-codes';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';

import { ChatOutput } from './ChatOutput';
import { PromptForm } from './PromptForm';
import { CreateMessageDto, MessageDto } from '../../contracts/Message';
import {
  checkVisitorVisits,
  fetchMessagesFromApi,
  runAssistant,
} from '../../lib/services/api';
import { LOCAL_STORAGE_THREAD_KEY } from '../config';
import { sendMessage } from '../../actions';
import { loadFingerprint } from '../../lib/utils/fingerprint';
import { dailyMessageLimit } from '../../config';
import { Alert } from '@salesyy/common-ui';
import { ChatResponse } from './ChatOutput/ChatResponse';

type Props = {
  threadId: string;
};

export const Assistant = ({ threadId }: Props) => {
  const [isInitialLoad, setIsInitialLoad] = useState(true); // it tells if we want to animate last assistant response
  const [isMessageLoading, setMessageIsLoading] = useState(false);
  const [userMessageId, setMessageId] = useState('');
  const [isLimitLock, setIsLimitLock] = useState(false);
  const [messageLoadingText, setMessageLoadingText] = useState('');
  const [isMessageError, setMessageIsError] = useState(false);
  const [messageError, setMessageError] = useState(false);
  const [streamedMessage, setStreamedMessage] = useState('');
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const messagesEndDivRef = useRef<HTMLDivElement>(null);
  const { push } = useRouter();
  const locale = useLocale();
  const { data, isLoading, isError, isSuccess, refetch } = useQuery({
    queryKey: ['messages', { threadId }],
    queryFn: fetchMessagesFromApi,
  });
  const t = useTranslations('Index');

  const initialMessages = data ? data.data : [];
  const isGlobalLoading = isLoading || isMessageLoading;

  useEffect(() => {
    if (isSuccess) {
      setIsInitialLoad(true);
    }
    const localStorageThreadId = localStorage.getItem(LOCAL_STORAGE_THREAD_KEY);
    if (!localStorageThreadId) {
      localStorage.setItem(LOCAL_STORAGE_THREAD_KEY, threadId);
    }
  }, []);

  useEffect(() => {
    if (isSuccess) {
      setIsInitialLoad(false);
    }
    if (messagesEndDivRef.current) {
      messagesEndDivRef.current.scrollIntoView({ behavior: 'smooth' });
    }
    const loadVisitorMessages = async () => {
      const visitorId = await loadFingerprint();
      const visitorMessagesResponse = await checkVisitorVisits(visitorId);
      if (visitorMessagesResponse.data.messages >= dailyMessageLimit) {
        setIsLimitLock(true);
      }
    };
    loadVisitorMessages();
  }, [data]);

  // Function to take care of initial connect to the SSE API
  // Also, it reconnects to the SSE API as soon as it shuts down
  // This keeps the connection alive - forever with micro second delays
  const connectToStream = () => {
    // const eventSource = new EventSource(`/api/threads/${threadId}/sse`);
    const eventSource = new EventSource(`/api/threads/${threadId}/sse/v2`);
    eventSource.addEventListener('message', (event) => {
      const eventMessage = JSON.parse(event.data);
      if (eventMessage) {
        // TODO: add message to messages instead of revalidate
        if (eventMessage.type && eventMessage.type === 'message') {
          refetch();
          setMessageIsLoading(false);
        } else if (eventMessage.type && eventMessage.type === 'delta') {
          // setStreamedMessage(
          //   () => `${streamedMessage}${eventMessage.payload.content}`
          // );
        }
      }
    });

    // In case of any error, close the event source
    // So that it attempts to connect again
    // eventSource.addEventListener('error', () => {
    //   eventSource.close();
    //   setTimeout(connectToStream, 1);
    // });

    // As soon as SSE API source is closed, attempt to reconnect

    // @ts-ignore
    // eventSource.onclose = () => {
    //   setTimeout(connectToStream, 1);
    // };
    return eventSource;
  };

  useEffect(() => {
    // Initiate the first call to connect to SSE API
    if (userMessageId !== '') {
      const eventSource = connectToStream();
      // As the component unmounts, close listener to SSE API
      return () => {
        eventSource.close();
      };
    }
  }, [userMessageId]);

  const handleCloseThread: MouseEventHandler<HTMLButtonElement> = (event) => {
    event.preventDefault();
    localStorage.removeItem(LOCAL_STORAGE_THREAD_KEY);
    push(`/${locale}`);
  };

  const onSubmit = async (data: CreateMessageDto) => {
    try {
      setMessageIsLoading(true);

      setMessageLoadingText(() => t('status-thinking'));

      const visitorId = await loadFingerprint();
      const messageResponse = await sendMessage(threadId, data, visitorId);

      if (messageResponse.status === StatusCodes.BAD_REQUEST) {
        setMessageError(true);
        return;
      } else if (messageResponse.status === StatusCodes.CREATED) {
        if (messageResponse.message?.public_id) {
          // this is workaround to send message to opean ai thread and then reload sse here
          setMessageId(messageResponse.message?.public_id);
        }

        setMessageLoadingText(() => t('status-searching-memories'));

        // TODO: instead refetch mutate data
        refetch();
      }

      setMessageLoadingText(() => t('status-robots-are-waking-up'));

      setMessageLoadingText(() => t('status-asking-ai'));

      // TODO: vercel doesn't like to run this as server action
      // runAssistant(threadId); // refactored to streams, now SSE is listening if assistant run returns stream

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
          isInitialLoad={isInitialLoad}
        />
        {/* <div className="px-4 sm:px-4 lg:px-22 py-8">
          <div className="mb-6 border-solid 	border-2  border-gray-300 rounded-md p-2">
            <div className="text-sm">
              <strong>Assistant</strong> <span className="font-light"></span>
            </div>
            {streamedMessage}
          </div>
        </div> */}
        <div ref={messagesEndDivRef} />
      </div>

      {/* <Avatar /> */}
      {isLimitLock && (
        <div className="mt-auto px-4 sm:px-4 lg:px-22 pb-8">
          <Alert title={t('limit-reached')} type="info" />
        </div>
      )}
      {!isLimitLock && threadId && (
        <PromptForm
          handleCloseThread={handleCloseThread}
          isLoading={isGlobalLoading}
          onSubmit={onSubmit}
        />
      )}
    </>
  );
};
