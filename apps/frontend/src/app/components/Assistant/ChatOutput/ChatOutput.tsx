import { Message } from '../Assistant';
import { format } from 'date-fns';

import './chat-response.css';

type Props = {
  messages: Message[];
};

export const ChatOutput = ({ messages }: Props) => {
  return (
    <>
      <div className="chat-response">
        {messages.map((message) => (
          <div key={message.public_id} className="mb-4">
            <div>
              <strong>{message.role}</strong>{' '}
              {format(message.created_at, 'dd.MM.yyyy HH:mm:ss')}
            </div>
            <div dangerouslySetInnerHTML={{ __html: message.content }} />
          </div>
        ))}
      </div>
    </>
  );
};
