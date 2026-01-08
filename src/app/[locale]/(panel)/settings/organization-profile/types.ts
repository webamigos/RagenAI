import { z } from 'zod';

// Zod schemas
export const InviteMemberSchema = z.object({
  email: z.string().email('Nieprawidłowy adres email'),
  role: z.enum(['admin', 'member'], {
    required_error: 'Rola jest wymagana',
  }),
});

export const UpdateMemberRoleSchema = z.object({
  memberId: z.string().min(1),
  role: z.enum(['admin', 'member']), // owner nie może być zmieniany
});

// TypeScript types
export type InviteMemberFormData = z.infer<typeof InviteMemberSchema>;
export type UpdateMemberRoleFormData = z.infer<typeof UpdateMemberRoleSchema>;

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
