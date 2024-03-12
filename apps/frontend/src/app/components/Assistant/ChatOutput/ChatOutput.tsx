import { Message } from '../Assistant';

import './chat-response.css';

type Props = {
  messages: Message[];
};

export const ChatOutput = ({ messages }: Props) => {
  return (
    <>
      <div className="chat-response">
        {messages.map((message, index) => (
          <div key={index} className="mb-4">
            <div>
              <strong>{message.role}</strong> date
            </div>
            <div dangerouslySetInnerHTML={{ __html: message.content }} />
          </div>
        ))}
      </div>
    </>
  );
};
