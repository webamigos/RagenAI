import { Message } from '../Assistant';

import './chat-response.css';

type Props = {
  messages: Message[];
};

export const ChatOutput = ({ messages }: Props) => {
  return (
    <>
      <div>chat output here</div>
      <div className="chat-response">
        {messages.map((message, index) => (
          <div key={index}>
            <div>
              <strong>{message.role}</strong>
            </div>
            <div dangerouslySetInnerHTML={{ __html: message.content }} />
          </div>
        ))}
      </div>
    </>
  );
};
