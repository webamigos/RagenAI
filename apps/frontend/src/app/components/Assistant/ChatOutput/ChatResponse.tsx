import { memo, useEffect, useState } from 'react';
import markdownit from 'markdown-it';

import { MessageDto } from '../../../contracts/Message';

import './chat-response.css';

type Props = {
  message: MessageDto;
  isAssistantMessage: boolean;
  isInitialLoad: boolean;
};

const md = markdownit();

export const ChatResponse = memo(
  ({ message, isAssistantMessage, isInitialLoad }: Props) => {
    const [displayResponse, setDisplayResponse] = useState('');
    const [completedTyping, setCompletedTyping] = useState(false);

    useEffect(() => {
      if (!message) {
        return;
      }
      if (isInitialLoad) {
        setDisplayResponse(message.content);
        return;
      }

      setCompletedTyping(false);

      let i = 0;
      const stringResponse = message.content;

      const intervalId = setInterval(() => {
        setDisplayResponse(stringResponse.slice(0, i));

        i++;

        if (i > stringResponse.length) {
          clearInterval(intervalId);
          setCompletedTyping(true);
        }
      }, 20);

      return () => clearInterval(intervalId);
    }, [message]);

    const renderMessage = (message: MessageDto) => {
      return md.render(message.content);
    };

    const renderLastAssistantResponse = (message: string) => {
      console.log({ isInitialLoad });
      if (isInitialLoad || completedTyping) {
        return md.render(message);
      }
      return message;
    };

    const response = isAssistantMessage
      ? renderLastAssistantResponse(displayResponse)
      : renderMessage(message);

    return (
      <div
        className="chat-response"
        dangerouslySetInnerHTML={{
          __html: response,
        }}
      />
    );
  }
);

ChatResponse.displayName = 'ChatResponse';
