import { z } from 'zod';
import { WebsiteLoaderMode } from '@/app/contracts/DocumentLoading';

export const getAddFromUrlSchema = (t: (key: string) => string) =>
  z.object({
    url: z
      .string()
      .min(1, t('validation.url-required'))
      .url(t('validation.invalid-url')),
    mode: z.nativeEnum(WebsiteLoaderMode),
  });

export type AddFromUrlFormData = z.infer<
  ReturnType<typeof getAddFromUrlSchema>
>;
