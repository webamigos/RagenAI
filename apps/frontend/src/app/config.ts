export const locales = ['en', 'pl'];
export const defaultLocale = 'en';
export const redisChannelPrefix = 'assistant-messages-';
export const dailyMessageLimit = 3;
export const PROMPT_TEMPLATE = `
Odpowiadaj na podstawie wgranego contextu, jezeli nie znajdziesz w nim odpowiedzi, dopiero wtedy przeszukuj sieć:
context: {context}
{chat_history}
user: {input}
assistant:`;
