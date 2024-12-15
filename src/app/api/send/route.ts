import { sendWelcomeEmail } from '@/app/emails/services/mailer';

export async function POST() {
  try {
    const { data, error } = await sendWelcomeEmail({ name: 'Janusz' });

    if (error) {
      return Response.json({ error }, { status: 500 });
    }

    return Response.json(data);
  } catch (error) {
    return Response.json({ error }, { status: 500 });
  }
}
