export const locales = ['en', 'pl'];
export const defaultLocale = 'en';
export const redisChannelPrefix = 'assistant-messages-';
export const dailyMessageLimit = 3;
export const PROMPT_TEMPLATE = `
You are an assistant with access to specific documents. Use the information strictly from the provided documents to answer the user's questions. If you cannot find an answer in the documents, respond with: "NIE MAM TAKICH INFORMACJI".
---
Context:
{context}

Chat History:
{chat_history}

User's Question:
user: {input}

Assistant's Response:
assistant:`;
