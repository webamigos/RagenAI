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

// Zod schemas
export const InviteMemberSchema = z.object({
  email: z.email('Nieprawidłowy adres email'),
  role: z.enum(ASSIGNABLE_ROLES, { error: 'Rola jest wymagana' }),
});

/**
 * One schema for both ways of adding someone, keyed on `mode`.
 *
 * Swapping resolvers per mode instead would give react-hook-form two different
 * form types for one form, which does not typecheck — and `name` genuinely is
 * conditional: the create path needs one because nobody types a name during a
 * sign-up that never happens, while an invitation collects it later.
 */
export const AddMemberSchema = z
  .object({
    mode: z.enum(['invite', 'create']),
    email: z.email('Nieprawidłowy adres email'),
    role: z.enum(ASSIGNABLE_ROLES, { error: 'Rola jest wymagana' }),
    name: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.mode === 'create' && !data.name) {
      ctx.addIssue({
        code: 'custom',
        path: ['name'],
        message: 'Imię i nazwisko są wymagane',
      });
    }
  });

export const UpdateMemberRoleSchema = z.object({
  memberId: z.string().min(1),
  role: z.enum(ASSIGNABLE_ROLES), // owner nie może być zmieniany
});

export const UpdateOrganizationSchema = z.object({
  name: z
    .string()
    .min(1, 'Nazwa jest wymagana')
    .max(100, 'Nazwa może mieć max 100 znaków'),
});

// TypeScript types
export type InviteMemberFormData = z.infer<typeof InviteMemberSchema>;
export type AddMemberFormData = z.infer<typeof AddMemberSchema>;
export type UpdateMemberRoleFormData = z.infer<typeof UpdateMemberRoleSchema>;
export type UpdateOrganizationFormData = z.infer<
  typeof UpdateOrganizationSchema
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
