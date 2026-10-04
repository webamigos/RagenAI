import { z } from 'zod';

/**
 * The shape of `t` these factories need. A scoped `useTranslations('…')` fits it,
 * and so does a plain function in a test. Values are for ICU placeholders.
 */
type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export const NAME_MAX_LENGTH = 100;
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Schemas are built from a translator, following `getAddFromUrlSchema`, so the
 * messages a user sees are in the language they chose rather than in Polish.
 * `t` is scoped to `user-profile.profile`.
 */
export const getUpdateProfileSchema = (t: Translate) =>
  z.object({
    name: z
      .string()
      .min(1, t('validation.name-required'))
      .max(
        NAME_MAX_LENGTH,
        t('validation.name-too-long', { max: NAME_MAX_LENGTH }),
      ),
  });

/** `t` is scoped to `user-profile.password`. */
export const getChangePasswordSchema = (t: Translate) => {
  const tooShort = t('validation.min-length', { min: PASSWORD_MIN_LENGTH });

  return z
    .object({
      currentPassword: z.string().min(PASSWORD_MIN_LENGTH, tooShort),
      newPassword: z.string().min(PASSWORD_MIN_LENGTH, tooShort),
      confirmPassword: z.string().min(PASSWORD_MIN_LENGTH, tooShort),
    })
    .superRefine(({ newPassword, confirmPassword, currentPassword }, ctx) => {
      if (newPassword !== confirmPassword) {
        ctx.addIssue({
          code: 'custom',
          message: t('validation.passwords-mismatch'),
          path: ['confirmPassword'],
        });
      }
      if (newPassword === currentPassword) {
        ctx.addIssue({
          code: 'custom',
          message: t('validation.must-differ'),
          path: ['newPassword'],
        });
      }
    });
};

// TypeScript types
export type UpdateProfileFormData = z.infer<
  ReturnType<typeof getUpdateProfileSchema>
>;
export type ChangePasswordFormData = z.infer<
  ReturnType<typeof getChangePasswordSchema>
>;
