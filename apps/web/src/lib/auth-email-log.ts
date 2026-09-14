import { maskEmail } from '@/libs/events/mask-email';

export type OrganizationInviteLogData = {
  email: string;
  organizationName: string;
  id: string;
};

export function passwordResetEmailLog(to: string) {
  return { to: maskEmail(to) };
}

export function verificationEmailLog(to: string) {
  return { to: maskEmail(to) };
}

export function invitationEmailLog(email: string) {
  return { email: maskEmail(email) };
}

export function invitationErrorLog(
  data: OrganizationInviteLogData,
  error: unknown,
) {
  return {
    error,
    to: maskEmail(data.email),
    organizationName: data.organizationName,
    invitationId: data.id,
  };
}
