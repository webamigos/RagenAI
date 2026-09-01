import { getMailProvider, getResendProvider } from '@/libs/mail';
import { WelcomeEmail } from '../welcome-email';
import { InvitationEmail } from '../invitation-email';
import { MagicLinkInvitationEmail } from '../magic-link-invitation-email';
import { ContactEmail } from '../contact-email';
import { PasswordResetEmail } from '../password-reset-email';
import { VerificationEmail } from '../verification-email';
import { SecurityAlertEmail } from '../security-alert-email';
import { getUserResponseEmailContent } from '../email-template';
import { logger } from '@/app/lib/utils/logger';

const FROM_EMAIL =
  process.env.MAIL_FROM || 'Ragen AI <noreply@updates.webamigos.pl>';

const DEFAULT_SUPPORT_EMAIL = 'hello@webamigos.pl';

function getSupportRecipients(): string[] {
  const raw = process.env.MAIL_SUPPORT_TO ?? '';
  const parsed = raw
    .split(',')
    .map((e) => e.trim())
    .filter((e) => e.length > 0);
  return parsed.length > 0 ? parsed : [DEFAULT_SUPPORT_EMAIL];
}

const SECURITY_FROM_EMAIL = process.env.SECURITY_ALERT_FROM || FROM_EMAIL;

/**
 * Parse comma-separated recipient list from env. Empty / unset → feature off.
 */
function getSecurityAlertRecipients(): string[] {
  const raw = process.env.SECURITY_ALERT_EMAIL;
  if (!raw || raw.trim() === '') {
    return [];
  }
  return raw
    .split(',')
    .map((e) => e.trim())
    .filter((e) => e.length > 0);
}

// In-process dedupe + rate cap for security alert emails. Best-effort across
// serverless instances — the downside of a few duplicate alerts is trivial
// compared to the cost of an alert storm from one attacker hammering a
// single endpoint.
const SECURITY_DEDUPE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const SECURITY_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const SECURITY_RATE_MAX = 20; // 20 alerts per hour per process

const recentSecurityAlerts = new Map<string, number>();
const rateWindowTimestamps: number[] = [];

function shouldSendSecurityAlert(dedupeKey: string): boolean {
  const now = Date.now();

  // Prune old entries — cheap, runs once per call.
  for (const [key, ts] of recentSecurityAlerts) {
    if (now - ts > SECURITY_DEDUPE_WINDOW_MS) {
      recentSecurityAlerts.delete(key);
    }
  }
  while (
    rateWindowTimestamps.length > 0 &&
    now - rateWindowTimestamps[0] > SECURITY_RATE_WINDOW_MS
  ) {
    rateWindowTimestamps.shift();
  }

  const lastSent = recentSecurityAlerts.get(dedupeKey);
  if (lastSent && now - lastSent < SECURITY_DEDUPE_WINDOW_MS) {
    return false;
  }
  if (rateWindowTimestamps.length >= SECURITY_RATE_MAX) {
    return false;
  }

  recentSecurityAlerts.set(dedupeKey, now);
  rateWindowTimestamps.push(now);
  return true;
}

type SecurityAlertEvent = {
  publicId: string;
  eventType: string;
  severity: string;
  source: string;
  organizationId: string | null;
  userId: string | null;
  ipAddress: string | null;
  requestId: string | null;
  createdAt: Date;
};

/**
 * Dispatch a security alert email. Skipped silently when:
 *   • `SECURITY_ALERT_EMAIL` env is empty (feature off)
 *   • The same (eventType, userId|organizationId|ipAddress) fired in the
 *     last 15 minutes (dedupe)
 *   • More than 20 alerts have been sent in the last hour (rate cap)
 *
 * Only `critical` events should reach this function — severity gating
 * is the caller's responsibility (see recordSecurityEvent).
 */
export const sendSecurityAlertEmail = async ({
  event,
}: {
  event: SecurityAlertEvent;
}) => {
  const recipients = getSecurityAlertRecipients();
  if (recipients.length === 0) {
    logger.debug(
      { eventType: event.eventType },
      'SECURITY_ALERT_EMAIL not configured — skipping alert dispatch',
    );
    return { skipped: 'not-configured' as const };
  }

  const dedupeKey = [
    event.eventType,
    event.userId ?? event.organizationId ?? event.ipAddress ?? 'unknown',
  ].join(':');

  if (!shouldSendSecurityAlert(dedupeKey)) {
    logger.info(
      { dedupeKey, eventType: event.eventType },
      'Security alert deduplicated or rate-capped',
    );
    return { skipped: 'rate-limited' as const };
  }

  try {
    await getMailProvider().send({
      from: SECURITY_FROM_EMAIL,
      to: recipients,
      subject: `[Ragen Security] ${event.severity.toUpperCase()}: ${event.eventType}`,
      react: SecurityAlertEmail({
        publicId: event.publicId,
        eventType: event.eventType,
        severity: event.severity,
        source: event.source,
        organizationId: event.organizationId,
        userId: event.userId,
        ipAddress: event.ipAddress,
        requestId: event.requestId,
        createdAtIso: event.createdAt.toISOString(),
      }),
    });
    return { data: true };
  } catch (error) {
    logger.error(
      { error, eventType: event.eventType, publicId: event.publicId },
      'Failed to send security alert email',
    );
    return { error: 'Failed to send security alert email' };
  }
};

export const sendWelcomeEmail = async ({
  to,
  name,
}: {
  to: string;
  name: string | undefined;
}) => {
  try {
    await getMailProvider().send({
      from: FROM_EMAIL,
      to,
      subject: 'Witaj w Ragen!',
      react: WelcomeEmail({ name }),
    });

    return { data: true };
  } catch (error) {
    logger.error({ error }, 'Failed to send welcome email');
    return { error: 'Nie udało się wysłać powitalnego e-maila' };
  }
};

export const sendContactEmail = async ({
  email,
  title,
  message,
  category,
  files,
}: {
  title: string;
  email: string;
  message: string;
  category?: string;
  files?: { filename: string; content: string }[];
}) => {
  try {
    const attachments = files && files.length > 0 ? files : undefined;
    const mail = getMailProvider();

    await mail.send({
      from: FROM_EMAIL,
      to: getSupportRecipients(),
      replyTo: email,
      subject: `[Ragen Support] ${title}`,
      react: ContactEmail({ email, message, category }),
      attachments,
    });

    const { subject, text } = getUserResponseEmailContent(title, message);

    await mail.send({
      from: FROM_EMAIL,
      to: email,
      subject: `[Ragen Support] ${subject}`,
      text,
      attachments,
    });

    return { data: true };
  } catch (error) {
    logger.error({ error: error }, 'Błąd wysyłania wiadomości:');
    return { error: 'Nie udało się wysłać wiadomości kontaktowej' };
  }
};

/**
 * Adds a contact to a Resend segment/audience.
 * No-op when using SMTP provider (segments are Resend-specific).
 */
export const addContactToSegment = async ({
  email,
  firstName,
  lastName,
  segmentId,
}: {
  email: string;
  firstName?: string;
  lastName?: string;
  segmentId: string;
}) => {
  const resend = getResendProvider();
  if (!resend) {
    logger.debug(
      { email, segmentId },
      'addContactToSegment skipped — not using Resend provider',
    );
    return { data: null };
  }

  try {
    const response = await resend.addContactToSegment({
      email,
      firstName,
      lastName,
      segmentId,
    });
    return { data: response };
  } catch (error) {
    logger.error(
      { error, email, segmentId },
      'Failed to add contact to Resend segment',
    );
    return { error: 'Failed to add contact to segment' };
  }
};

export const sendPasswordResetEmailViaMailer = async ({
  to,
  resetUrl,
}: {
  to: string;
  resetUrl: string;
}) => {
  try {
    await getMailProvider().send({
      from: FROM_EMAIL,
      to,
      subject: 'Zresetuj hasło do Ragen',
      react: PasswordResetEmail({ resetUrl }),
    });

    return { data: true };
  } catch (error) {
    logger.error({ error, to }, 'Failed to send password reset email');
    return { error: 'Failed to send password reset email' };
  }
};

export const sendVerificationEmail = async ({
  to,
  verificationUrl,
}: {
  to: string;
  verificationUrl: string;
}) => {
  try {
    await getMailProvider().send({
      from: FROM_EMAIL,
      to,
      subject: 'Zweryfikuj swój adres email - Ragen AI',
      react: VerificationEmail({ verificationUrl }),
    });

    return { data: true };
  } catch (error) {
    logger.error({ error, to }, 'Failed to send verification email');
    return { error: 'Failed to send verification email' };
  }
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

    await getMailProvider().send({
      from: FROM_EMAIL,
      to,
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
      { to, organizationName, invitationId },
      'Invitation email sent successfully',
    );

    return { data: true };
  } catch (error) {
    logger.error(
      { error, to, organizationName, invitationId },
      'Failed to send invitation email',
    );
    return { error: 'Nie udało się wysłać emaila z zaproszeniem' };
  }
};

export const sendMagicLinkInvitationEmail = async ({
  to,
  magicLinkUrl,
  organizationName,
  inviterName,
  role,
}: {
  to: string;
  magicLinkUrl: string;
  organizationName: string;
  inviterName?: string;
  role: string;
}) => {
  try {
    logger.info(
      { to, organizationName },
      'Attempting to send magic-link invitation email',
    );

    await getMailProvider().send({
      from: FROM_EMAIL,
      to,
      subject: `Zaproszenie do organizacji ${organizationName} w Ragen AI`,
      react: MagicLinkInvitationEmail({
        invitedEmail: to,
        organizationName,
        inviterName,
        role,
        magicLinkUrl,
      }),
    });

    logger.info(
      { to, organizationName },
      'Magic-link invitation email sent successfully',
    );

    return { data: true };
  } catch (error) {
    logger.error(
      { error, to, organizationName },
      'Failed to send magic-link invitation email',
    );
    return { error: 'Nie udało się wysłać emaila z zaproszeniem' };
  }
};
