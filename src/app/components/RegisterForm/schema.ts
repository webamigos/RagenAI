import { z } from 'zod';

export const registrationSchema = z.object({
  email: z.string().email('Nieprawidłowy adres email'),
  password: z.string().min(8, 'Hasło musi mieć co najmniej 8 znaków'),
});

export type RegistrationFormData = z.infer<typeof registrationSchema>;

export const verificationSchema = z.object({
  email_code: z.string().min(6, 'Kod weryfikacyjny składa się z 6 znaków'),
});

export type VerificationFormData = z.infer<typeof verificationSchema>;
