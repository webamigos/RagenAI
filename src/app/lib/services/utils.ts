import { OpenAI } from 'openai';

// https://github.com/openai/openai-node/issues/454#issuecomment-1806646751
export const parseThreadMessage = (
  message: OpenAI.Beta.Threads.Messages.Message
) =>
  message.content
    .map((msg) => (msg.type === 'text' ? msg.text.value : ''))
    .join('');

export const parseThreadDelta = (
  message: OpenAI.Beta.Threads.Messages.MessageDelta
) => {
  if (message.content) {
    return message.content
      .map((msg) => (msg.type === 'text' && msg.text ? msg.text.value : ''))
      .join('');
  }
  return '';
};
