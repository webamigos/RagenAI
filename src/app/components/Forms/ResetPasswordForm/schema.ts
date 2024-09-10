import { z } from 'zod';

export const ResetPasswordSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  code: z.string().min(6),
});

export type ResetPasswordData = z.infer<typeof ResetPasswordSchema>;
