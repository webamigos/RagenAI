import { z } from 'zod';

export const validationSchema = (t: (key: string) => string) =>
  z.object({
    name: z.string().min(3, t('name-is-to-short')),
    project_id: z.string({ required_error: t('project-is-required') }),
  });

export type ApiKeyDto = z.infer<ReturnType<typeof validationSchema>>;
