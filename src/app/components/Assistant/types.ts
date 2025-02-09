export type ErrorEvent = Event & { data?: string };

export type TranslationFn = (
  key: string,
  values?: Record<string, any>
) => string;
