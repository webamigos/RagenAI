import { Resend } from 'resend';
import { WelcomeEmail } from '../welcome-email';

const resend = new Resend(process.env.RESEND_API_KEY);

const emailConfig = {
  from: 'Acme <onboarding@resend.dev>', // for testing
  to: ['delivered@resend.dev'], // for testing
  replyTo: ['patryk@webamigos.pl'], // to specify
};

export const sendWelcomeEmail = async ({
  name,
}: {
  name: string | undefined;
}) => {
  return await resend.emails.send({
    ...emailConfig,
    subject: 'Welcome to Ragen!',
    react: WelcomeEmail({ name }),
  });
};
