export const locales = ['en', 'pl'];
export const defaultLocale = 'en';
export const redisChannelPrefix = 'assistant-messages-';
export const dailyMessageLimit = 3;

export const standaloneQuestionTemplate = `Given some conversation history (if any) and a question.
conversation history: {conv_history}
question: {question}`;
export const answerTemplate = `You are a helpful and enthusiastic support bot who can answer a given question based on the context provided and the conversation history. Try to find the answer in the context. If the answer is not given in the context, find the answer in the conversation history if possible. If you really don't know the answer, say "I'm sorry, I don't know the answer to that." Don't try to make up an answer. Always speak as if you were chatting to a friend.
context: {context}
conversation history: {conv_history}
question: {question}
answer: `;
