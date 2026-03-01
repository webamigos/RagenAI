import { z } from 'zod';

export const registrationSchema = (t: (key: string) => string) =>
  z.object({
    terms: z.boolean().refine((value) => value === true, {
      error: t('validation.terms'),
    }),
    newsletter_consent: z.boolean(),
    email: z.email(t('validation.email')),
    password: z.string().min(8, t('validation.password')),
  });

export type RegistrationFormData = z.infer<
  ReturnType<typeof registrationSchema>
>;
