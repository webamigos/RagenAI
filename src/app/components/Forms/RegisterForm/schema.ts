import { z } from 'zod';

export const registrationSchema = z.object({
  email: z.string().email('Nieprawidłowy adres email'),
  password: z.string().min(8, 'Hasło musi mieć co najmniej 8 znaków'),
});

export type RegistrationFormData = z.infer<typeof registrationSchema>;
