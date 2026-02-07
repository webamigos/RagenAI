import { z } from 'zod';

// Zod schemas
export const UpdateProfileSchema = z.object({
  name: z
    .string()
    .min(1, 'Nazwa jest wymagana')
    .max(100, 'Nazwa może mieć max 100 znaków'),
  image: z.string().url('Nieprawidłowy URL').optional().or(z.literal('')),
});

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(8, 'Minimum 8 znaków'),
    newPassword: z.string().min(8, 'Minimum 8 znaków'),
    confirmPassword: z.string().min(8, 'Minimum 8 znaków'),
  })
  .superRefine(({ newPassword, confirmPassword, currentPassword }, ctx) => {
    if (newPassword !== confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        message: 'Hasła nie pasują',
        path: ['confirmPassword'],
      });
    }
    if (newPassword === currentPassword) {
      ctx.addIssue({
        code: 'custom',
        message: 'Nowe hasło musi być inne niż obecne',
        path: ['newPassword'],
      });
    }
  });

// TypeScript types
export type UpdateProfileFormData = z.infer<typeof UpdateProfileSchema>;
export type ChangePasswordFormData = z.infer<typeof ChangePasswordSchema>;
