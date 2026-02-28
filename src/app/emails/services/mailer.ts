import { type CreateContactOptions, Resend } from 'resend';
import { WelcomeEmail } from '../welcome-email';
import { InvitationEmail } from '../invitation-email';
import { getUserResponseEmailContent } from '../email-template';
import { logger } from '@/app/lib/utils/logger';

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendWelcomeEmail = async ({
  to,
  name,
}: {
  to: string;
  name: string | undefined;
}) => {
  try {
    const response = await resend.emails.send({
      from: 'Ragen <noreply@updates.ragen.ai>',
      to: [to],
      subject: 'Witaj w Ragen!',
      react: WelcomeEmail({ name }),
    });

    return { data: response };
  } catch (error) {
    return { error: 'Nie udało się wysłać powitalnego e-maila' };
  }
};

export const sendContactEmail = async ({
  email,
  title,
  message,
  files,
}: {
  title: string;
  email: string;
  message: string;
  files?: { filename: string; content: string }[];
}) => {
  try {
    const attachments = files && files.length > 0 ? files : [];

    const response = await resend.emails.send({
      from: 'Ragen AI <noreply@updates.ragen.ai>',
      to: ['hello@webamigos.pl'],
      replyTo: email,
      subject: `[Ragen Support] ${title}`,
      text: message,
      attachments,
    });

    const { subject, text } = getUserResponseEmailContent(title, message);

    const userResponse = await resend.emails.send({
      from: 'Ragen AI <noreply@updates.ragen.ai>',
      to: email,
      subject: `[Ragen Support] ${subject}`,
      text,
      attachments,
    });

    return { data: { response, userResponse } };
  } catch (error) {
    logger.error({ error: error }, 'Błąd wysyłania wiadomości:');
    return { error: 'Nie udało się wysłać wiadomości kontaktowej' };
  }
};

export const addEmailToAudience = async (
  resendContactDetails: CreateContactOptions,
) => {
  return await resend.contacts.create(resendContactDetails);
};

export const sendPasswordResetEmailViaMailer = async ({
  to,
  resetUrl,
}: {
  to: string;
  resetUrl: string;
}) => {
  const response = await resend.emails.send({
    from: 'Ragen <noreply@updates.ragen.ai>',
    to: [to],
    subject: 'Reset your Ragen password',
    text: `Click the following link to reset your password: ${resetUrl}\n\nIf you did not request a password reset, please ignore this email.\n\nThis link will expire in 1 hour.`,
  });

  return { data: response };
};

export const sendInvitationEmail = async ({
  to,
  organizationName,
  inviterName,
  role,
  invitationId,
  expiresAt,
}: {
  to: string;
  organizationName: string;
  inviterName?: string;
  role: string;
  invitationId: string;
  expiresAt: Date;
}) => {
  try {
    logger.info(
      { to, organizationName, invitationId },
      'Attempting to send invitation email',
    );

    const response = await resend.emails.send({
      from: 'Acme <onboarding@resend.dev>', // Zmieniono na zweryfikowaną domenę testową
      to: [to],
      subject: `Zaproszenie do organizacji ${organizationName} w Ragen AI`,
      react: InvitationEmail({
        invitedEmail: to,
        organizationName,
        inviterName,
        role,
        invitationId,
        expiresAt,
      }),
    });

    logger.info(
      { to, organizationName, invitationId, resendResponse: response },
      'Invitation email sent successfully via Resend',
    );

    return { data: response };
  } catch (error) {
    logger.error(
      { error, to, organizationName, invitationId },
      'Failed to send invitation email',
    );
    return { error: 'Nie udało się wysłać emaila z zaproszeniem' };
  }
};
