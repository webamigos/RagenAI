import { z } from 'zod';

export const verificationSchema = z.object({
  email_code: z.string().min(6, 'Kod weryfikacyjny składa się z 6 znaków'),
});

export type VerificationFormData = z.infer<typeof verificationSchema>;
