import { z } from 'zod';
import { WebsiteLoaderMode } from '@/features/documents/contracts/document.types';

export const getAddFromUrlSchema = (t: (key: string) => string) =>
  z.object({
    url: z
      .url(t('validation.invalid-url'))
      .min(1, t('validation.url-required')),
    mode: z.enum(WebsiteLoaderMode),
  });

export type AddFromUrlFormData = z.infer<
  ReturnType<typeof getAddFromUrlSchema>
>;
