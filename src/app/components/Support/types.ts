import { z } from 'zod';

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export const getSupportFormSchema = (t: (key: string) => string) =>
  z.object({
    email: z.string().email(t('errors.invalid-email')),
    title: z.string().min(5, t('errors.title-min')),
    message: z.string().min(10, t('errors.message-min')),
    file:
      typeof window === 'undefined'
        ? z.any()
        : z
            .instanceof(FileList)
            .transform((fileList) => Array.from(fileList) as File[])
            .refine((fileList) => fileList.length > 0, {
              message: t('errors.file-required'),
            })
            .refine(
              (fileList) =>
                Array.from(fileList).every(
                  (file) => file.size <= MAX_FILE_SIZE
                ),
              {
                message: t('errors.file-size'),
              }
            ),
  });

export type SupportFormData = z.infer<ReturnType<typeof getSupportFormSchema>>;
