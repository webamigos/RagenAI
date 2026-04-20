import type { ReactElement } from 'react';

export interface SendMailOptions {
  from: string;
  to: string | string[];
  subject: string;
  react?: ReactElement;
  text?: string;
  replyTo?: string;
  attachments?: { filename: string; content: string }[];
}

export interface MailProvider {
  send(options: SendMailOptions): Promise<void>;
}
