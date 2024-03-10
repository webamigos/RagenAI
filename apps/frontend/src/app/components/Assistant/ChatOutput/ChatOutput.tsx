import { Message } from '../Assistant';

type Props = {
  messages: Message[];
};

export const ChatOutput = ({ messages }: Props) => {
  return (
    <>
      <div>chat output here</div>
      {messages.map((message, index) => (
        <div key={index}>
          <div>
            <strong>{message.role}</strong>
          </div>
          <div>{message.content}</div>
        </div>
      ))}
    </>
  );
};
