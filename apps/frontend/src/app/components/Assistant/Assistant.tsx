'use client';

import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
//import markdownit from 'markdown-it';
import { Role, Message as MessageModel } from '@prisma/client';

import { Button } from '@salesyy/common-ui';

import { ChatOutput } from './ChatOutput';
import { PromptForm } from './PromptForm';
import { CreateThreadDto } from '../../api/threads/route';
import { MessageDto } from '../../contracts/MessageDto';
import { fetchMessagesFromApi } from '../../lib/services/api';
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
  // console.log({ initialMessages, isLoading, isError });

  useEffect(() => {
    const localThreadId = localStorage.getItem(LOCAL_STORAGE_THREAD_KEY);
    setThreadId(localThreadId ? localThreadId : '');
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

  const onSubmit = async (data: MessageDto) => {
    try {
      setMessageIsLoading(true);
      setMessageLoadingText('Thinking...');
      const result = await api.post<MessageResponse>(
        `/threads/${threadId}/messages`,
        data
      );
      setMessageLoadingText('Searching memories...');
      refetch();

      // const messageResponse = result.data.message;
      // console.log(result.status);

      // const md = markdownit();

      // setMessages((currentMessages) => [
      //   ...currentMessages,
      //   {
      //     public_id: messageResponse.public_id,
      //     role: messageResponse.role,
      //     content: md.render(messageResponse.content),
      //     created_at: messageResponse.created_at,
      //   },
      // ]);
      // setMessageIsLoading(true);

      setMessageLoadingText('Beep, boop, robots are waking up...');
      setMessageLoadingText('Asking AI what it thinks about your question...');

      const assistantResult = await api.post<MessageResponse>(
        `/assistant/${threadId}`
      );
      const assistantResponse = assistantResult.data.message;

      setMessageLoadingText('Analyzing your question...');

      // setMessages((currentMessages) => [
      //   ...currentMessages,
      //   {
      //     public_id: assistantResponse.public_id,
      //     role: assistantResponse.role,
      //     content: md.render(assistantResponse.content),
      //     created_at: assistantResponse.created_at,
      //   },
      // ]);
      refetch();
      setMessageIsLoading(false);
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
          loading={isMessageLoading}
          loadingMessage={messageLoadingText}
        />
        {threadId && <PromptForm onSubmit={onSubmit} />}

        {!threadId && (
          <div className="mt-6 flex flex-col items-center">
            <Button
              label={t('start-new-thread')}
              className="bg-salesyy-red hover:bg-red-700"
              onClick={handleNewThread}
            />
          </div>
        )}
      </div>
    </div>
  );
};
