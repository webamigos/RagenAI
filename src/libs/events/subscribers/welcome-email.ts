import { eventBus } from '@/libs/events';
import type { Unsubscribe } from '@/libs/events';

export function registerWelcomeEmailSubscriber(): Unsubscribe {
  return eventBus.on('user.emailVerified', async ({ email, name }) => {
    const { sendWelcomeEmail } = await import('@/app/emails/services/mailer');
    const result = await sendWelcomeEmail({ to: email, name: name || 'User' });
    if ('error' in result) {
      // eslint-disable-next-line no-console
      console.error('[events:welcome-email] send failed', {
        to: email,
        error: result.error,
      });
      return;
    }
    // eslint-disable-next-line no-console
    console.log('[events:welcome-email] sent', { to: email });
  });
}
