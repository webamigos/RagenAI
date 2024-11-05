import { z } from 'zod';

export const validationSchema = (t: (key: string) => string) =>
  z.object({
    name: z.string().min(3, t('name-is-to-short')),
  });

export type ApiKeyDto = z.infer<ReturnType<typeof validationSchema>>;
