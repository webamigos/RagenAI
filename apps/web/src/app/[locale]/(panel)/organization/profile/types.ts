import { z } from 'zod';

import { ORG_ADMIN_ROLE, ORG_MEMBER_ROLE } from '@ragenai/platform-contracts';

/**
 * The roles a member can be *given* here — deliberately not `ORG_ROLES`.
 * `owner` is excluded because it is transferred, not assigned, and the two
 * actions behind these schemas refuse to touch an owner at all. Built from the
 * shared constants rather than string literals so that a new role shows up as
 * a decision to make in this file rather than a silent omission.
 */
const ASSIGNABLE_ROLES = [ORG_ADMIN_ROLE, ORG_MEMBER_ROLE] as const;

/**
 * The shape of `t` these factories need. A scoped `useTranslations('…')` fits it,
 * and so does a plain function in a test. Values are for ICU placeholders.
 */
type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export const ORGANIZATION_NAME_MAX_LENGTH = 100;

// Zod schemas
//
// The ones with messages are built from a translator, following
// `getAddFromUrlSchema`, so what a user sees is in the language they chose.

/**
 * One schema for both ways of adding someone, keyed on `mode`.
 *
 * Swapping resolvers per mode instead would give react-hook-form two different
 * form types for one form, which does not typecheck — and `name` genuinely is
 * conditional: the create path needs one because nobody types a name during a
 * sign-up that never happens, while an invitation collects it later.
 *
 * `t` is scoped to `organization.members`.
 */
export const getAddMemberSchema = (t: Translate) =>
  z
    .object({
      mode: z.enum(['invite', 'create']),
      email: z.email(t('validation.invalid-email')),
      role: z.enum(ASSIGNABLE_ROLES, { error: t('validation.role-required') }),
      name: z.string().trim().optional(),
    })
    .superRefine((data, ctx) => {
      if (data.mode === 'create' && !data.name) {
        ctx.addIssue({
          code: 'custom',
          path: ['name'],
          message: t('validation.full-name-required'),
        });
      }
    });

export const UpdateMemberRoleSchema = z.object({
  memberId: z.string().min(1),
  role: z.enum(ASSIGNABLE_ROLES), // owner nie może być zmieniany
});

/** `t` is scoped to `organization.profile`. */
export const getUpdateOrganizationSchema = (t: Translate) =>
  z.object({
    name: z
      .string()
      .min(1, t('validation.name-required'))
      .max(
        ORGANIZATION_NAME_MAX_LENGTH,
        t('validation.name-too-long', { max: ORGANIZATION_NAME_MAX_LENGTH }),
      ),
  });

// TypeScript types
export type AddMemberFormData = z.infer<ReturnType<typeof getAddMemberSchema>>;
export type UpdateMemberRoleFormData = z.infer<typeof UpdateMemberRoleSchema>;
export type UpdateOrganizationFormData = z.infer<
  ReturnType<typeof getUpdateOrganizationSchema>
>;

export type Member = {
  id: string;
  userId: string;
  role: string;
  createdAt: Date;
  user: {
    id: string;
    name?: string;
    email: string;
    image?: string;
  };
};

export type Invitation = {
  id: string;
  email: string;
  role: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  expiresAt: Date;
  createdAt: Date;
  inviterId?: string;
};
