import { render } from '@react-email/render';

import { logger } from '@/app/lib/utils/logger';
import type { MailProvider, SendMailOptions } from './types';

/**
 * Writes messages to the log instead of sending them.
 *
 * This is what an install with no mail credentials falls back to. Address
 * verification, magic links and invitations are all links delivered by email —
 * without a transport they do not merely fail to arrive, they lock the operator
 * out of their own install with no way to see the link. Logging it keeps the
 * flow completable on a laptop with no SMTP server.
 *
 * Never selected implicitly in production: {@link getMailProvider} treats a
 * production environment with no mail configured as an error instead.
 */
export class ConsoleMailProvider implements MailProvider {
  async send(options: SendMailOptions): Promise<void> {
    const html = options.react ? await render(options.react) : undefined;
    // The links are the point — pull them out so the operator does not have to
    // read rendered HTML to find the one URL they need.
    const links = html ? extractLinks(html) : [];

    logger.warn(
      {
        to: options.to,
        subject: options.subject,
        links,
        text: options.text,
      },
      'No mail provider configured — email logged instead of sent',
    );
  }
}

function extractLinks(html: string): string[] {
  const matches = html.matchAll(/href="(https?:\/\/[^"]+)"/g);
  return [...new Set([...matches].map((match) => match[1]))];
}
