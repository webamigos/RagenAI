import { Resend } from 'resend';
import type { MailProvider, SendMailOptions } from './types';

export class ResendMailProvider implements MailProvider {
  private client: Resend;

  constructor() {
    this.client = new Resend(process.env.RESEND_API_KEY);
  }

  async send(options: SendMailOptions): Promise<void> {
    const to = Array.isArray(options.to) ? options.to : [options.to];

    await this.client.emails.send({
      from: options.from,
      to,
      subject: options.subject,
      react: options.react,
      text: options.text,
      replyTo: options.replyTo,
      attachments: options.attachments,
    });
  }

  /**
   * Resend-specific: add a contact to a segment/audience.
   * Only available when using Resend provider.
   */
  async addContactToSegment({
    email,
    firstName,
    lastName,
    segmentId,
  }: {
    email: string;
    firstName?: string;
    lastName?: string;
    segmentId: string;
  }) {
    return await this.client.contacts.create({
      email,
      firstName,
      lastName,
      audienceId: segmentId,
    });
  }
}
