import { CreateContactOptions, Resend } from 'resend';
import { WelcomeEmail } from '../welcome-email';
import { ContactEmail } from '../email-template';
import { logger } from '@/app/lib/utils/logger';

const resend = new Resend(process.env.RESEND_API_KEY);

const emailConfig = {
  // from: 'Acme <onboarding@resend.dev>', // for testing
  from: 'Ragen <noreply@updates.ragen.ai>', // for testing
  to: ['delivered@resend.dev'], // for testing
  replyTo: ['patryk@webamigos.pl'], // to specify
};

export const sendWelcomeEmail = async ({
  to,
  name,
}: {
  to: string;
  name: string;
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
  file,
}: {
  title: string;
  email: string;
  message: string;
  file?: { filename: string; content: string };
}) => {
  try {
    const attachments = file ? [file] : [];

    const response = await resend.emails.send({
      from: 'Ragen <noreply@updates.ragen.ai>',
      to: ['hello@webamigos.pl'],
      replyTo: email,
      subject: title,
      text: message,
      attachments,
    });

    const userResponse = await resend.emails.send({
      from: 'Ragen <noreply@updates.ragen.ai>',
      to: email,
      subject: `Kopia Twojej wiadomości: ${title}`,
      text: `Dziękujemy za kontakt z Ragen!\n\nOtrzymaliśmy Twoją wiadomość:\n\n${message}\n\nSkontaktujemy się z Tobą wkrótce.`,
      attachments,
    });

    return { data: { response, userResponse } };
  } catch (error) {
    logger.error({ error: error }, 'Błąd wysyłania wiadomości:');
    return { error: 'Nie udało się wysłać wiadomości kontaktowej' };
  }
};

export const addEmailToAudience = async (
  resendContactDetails: CreateContactOptions
) => {
  return await resend.contacts.create(resendContactDetails);
};
