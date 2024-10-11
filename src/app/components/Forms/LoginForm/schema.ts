import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('sign-in.invalid-email'),
  password: z.string().min(8, 'sign-in.invalid-password'),
});

export type LoginFormData = z.infer<typeof loginSchema>;
