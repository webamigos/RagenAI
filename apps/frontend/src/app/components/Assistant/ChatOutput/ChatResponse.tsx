import { memo, useEffect, useState } from 'react';
import markdownit from 'markdown-it';

import './chat-response.css';

type Props = {
  message: string;
  isAssistantMessage: boolean;
  isInitialLoad: boolean;
};

const md = markdownit();

export const ChatResponse = ({
  message,
  isAssistantMessage,
  isInitialLoad,
}: Props) => {
  const [displayResponse, setDisplayResponse] = useState('');
  const [completedTyping, setCompletedTyping] = useState(false);

  // useEffect(() => {
  //   if (!message) {
  //     return;
  //   }
  //   if (isInitialLoad) {
  //     setDisplayResponse(message);
  //     return;
  //   }

  //   setCompletedTyping(false);

  //   let i = 0;
  //   const stringResponse = message;

  //   const intervalId = setInterval(() => {
  //     setDisplayResponse(stringResponse.slice(0, i));

  //     i++;

  //     if (i > stringResponse.length) {
  //       clearInterval(intervalId);
  //       setCompletedTyping(true);
  //     }
  //   }, 20);

  //   return () => clearInterval(intervalId);
  // }, [message]);

  const renderLastAssistantResponse = (message: string) => {
    if (isInitialLoad || completedTyping) {
      return md.render(message);
    }
    return message;
  };

  const response = renderLastAssistantResponse(displayResponse);
  return (
    <div className="mb-6 border-solid 	border-2  border-gray-300 rounded-md p-2">
      <div className="chat-response">
        {message}
        {/* <div
          dangerouslySetInnerHTML={{
            __html: response,
          }}
        /> */}
      </div>
    </div>
  );
};

ChatResponse.displayName = 'ChatResponse';
