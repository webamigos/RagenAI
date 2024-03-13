import { OpenAI } from 'openai';

// https://github.com/openai/openai-node/issues/454#issuecomment-1806646751
export const parseMessage = (
  message: OpenAI.Beta.Threads.Messages.ThreadMessage
) =>
  message.content.map((msg) => (msg.type === 'text' ? msg.text : '')).join('');
