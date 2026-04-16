import { eventBus } from '@/libs/events';
import type { Unsubscribe } from '@/libs/events';
import { maskEmail } from '../mask-email';

const SEGMENT_ID = process.env.RESEND_DEFAULT_SEGMENT_ID;

export function registerNewsletterSignupSubscriber(): Unsubscribe | null {
  if (!SEGMENT_ID) {
    // eslint-disable-next-line no-console
    console.log(
      '[events:newsletter-signup] RESEND_DEFAULT_SEGMENT_ID not configured — subscriber disabled',
    );
    return null;
  }

  const segmentId = SEGMENT_ID;
  return eventBus.on('user.emailVerified', async ({ email, name }) => {
    const { addContactToSegment } =
      await import('@/app/emails/services/mailer');
    const result = await addContactToSegment({
      email,
      firstName: name || 'User',
      segmentId,
    });
    const maskedEmail = maskEmail(email);
    if ('error' in result) {
      // eslint-disable-next-line no-console
      console.error('[events:newsletter-signup] add failed', {
        email: maskedEmail,
        segmentId,
        error: result.error,
      });
      return;
    }
    // eslint-disable-next-line no-console
    console.log('[events:newsletter-signup] added', { email: maskedEmail });
  });
}
