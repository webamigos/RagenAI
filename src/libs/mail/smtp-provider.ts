import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { render } from '@react-email/render';
import type { MailProvider, SendMailOptions } from './types';

export class SmtpMailProvider implements MailProvider {
  private transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          }
        : undefined,
    });
  }

  async send(options: SendMailOptions): Promise<void> {
    let html: string | undefined;

    if (options.react) {
      html = await render(options.react);
    }

    const to = Array.isArray(options.to) ? options.to.join(', ') : options.to;

    await this.transporter.sendMail({
      from: options.from,
      to,
      subject: options.subject,
      html,
      text: options.text,
      replyTo: options.replyTo,
      attachments: options.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
      })),
    });
  }
}
