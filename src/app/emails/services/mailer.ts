import { Resend } from 'resend';
import { WelcomeEmail } from '../welcome-email';

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
  name: string | undefined;
}) => {
  return await resend.emails.send({
    ...emailConfig,
    to: [to],
    subject: 'Witaj w Ragen!',
    react: WelcomeEmail({ name }),
  });
};
