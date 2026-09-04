export const locales = ['en', 'pl', 'es', 'de', 'fr', 'pt', 'it'] as const;
export type Locale = (typeof locales)[number];
export const timezone = 'Europe/Warsaw';
export const defaultLocale = 'en';
export const dailyMessageLimit = 3;
export const visitorCookieName = 'ragen-visitor';
export const TRIAL_DAYS = 14;
export const TRIAL_PLAN_NAME = 'Trial';
export const FREE_PLAN_NAME = 'Free';

export const TEMPLATE = `Answer the user's questions based only on the following context. If the answer is not in the context, reply politely that you do not have that information available.:
==============================
context: {context}
==============================
chat_history: {chat_history}

user: {question}
assistant:`;
