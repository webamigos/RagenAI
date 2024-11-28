import { z } from 'zod';

export function createVerificationSchema(
  t: (key: string, params?: Record<string, any>) => string
) {
  return z.object({
    email_code: z.string().min(6, t('email_code.minLength', { length: 6 })),
  });
}

export type VerificationFormData = z.infer<
  ReturnType<typeof createVerificationSchema>
>;
