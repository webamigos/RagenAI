import { z } from 'zod';

// Zod schemas
export const InviteMemberSchema = z.object({
  email: z.email('Nieprawidłowy adres email'),
  role: z.enum(['admin', 'member'], { error: 'Rola jest wymagana' }),
});

export const UpdateMemberRoleSchema = z.object({
  memberId: z.string().min(1),
  role: z.enum(['admin', 'member']), // owner nie może być zmieniany
});

export const UpdateOrganizationSchema = z.object({
  name: z
    .string()
    .min(1, 'Nazwa jest wymagana')
    .max(100, 'Nazwa może mieć max 100 znaków'),
});

// TypeScript types
export type InviteMemberFormData = z.infer<typeof InviteMemberSchema>;
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
