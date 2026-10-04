import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render } from '@react-email/render';
import { describe, expect, it, vi } from 'vitest';

import { locales, type Locale } from '@/app/config';

vi.mock('../utils/base-url', () => ({
  getBaseUrl: () => 'https://app.example.test',
}));

import { InvitationEmail } from '../invitation-email';
import { MagicLinkInvitationEmail } from '../magic-link-invitation-email';
import { PasswordResetEmail } from '../password-reset-email';
import { SecurityAlertEmail } from '../security-alert-email';
import { VerificationEmail } from '../verification-email';
import { WelcomeEmail } from '../welcome-email';
import { getEmailTranslator } from '../utils/email-translator';

/**
 * Every transactional email in every language the app ships (#1092).
 *
 * They were Polish, subject and body, whatever the person reading spoke. These
 * render each template through the real translator for each locale and check
 * what a reader would actually see: that the placeholders were filled, that no
 * message key leaked through, that the document says which language it is in,
 * and that nothing is the Polish original.
 */

const MESSAGES = join(process.cwd(), 'src/app/messages');

function messages(locale: Locale): Record<string, any> {
  return JSON.parse(readFileSync(join(MESSAGES, `${locale}.json`), 'utf8'));
}

const text = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');

/** What must never reach a reader, in any language. */
function expectNoLeaks(html: string) {
  const visible = text(html);

  expect(visible).not.toMatch(/\{[a-zA-Z]+\}/); // an unfilled placeholder
  expect(visible).not.toMatch(/emails\.[a-z-]+\./); // a raw message key
  expect(visible).not.toMatch(/&lt;(strong|code)/); // a rich-text tag shown as text
  expect(visible).not.toContain('undefined');
}

const props = {
  organizationName: 'Acme Sp. z o.o.',
  invitedEmail: 'ada@example.com',
  inviterName: 'Grace Hopper',
  role: 'member',
};

describe.each(locales)('emails in %s', (locale) => {
  it('invitation', async () => {
    const t = await getEmailTranslator(locale, 'invitation');
    const html = await render(
      InvitationEmail({
        ...props,
        invitationId: 'inv_1',
        expiresAt: new Date('2026-12-24T10:00:00Z'),
        locale,
        t,
      }),
    );

    expectNoLeaks(html);
    expect(html).toContain(`lang="${locale}"`);
    expect(text(html)).toContain('Grace Hopper');
    expect(text(html)).toContain('Acme Sp. z o.o.');
    expect(text(html)).toContain(t('accept'));
    expect(html).toContain('/accept-invitation?token=inv_1');
    expect(t('subject', { organization: 'Acme' })).toContain('Acme');
  });

  it('invitation with no named inviter', async () => {
    const t = await getEmailTranslator(locale, 'invitation');
    const html = await render(
      InvitationEmail({
        ...props,
        inviterName: undefined,
        invitationId: 'inv_1',
        expiresAt: new Date('2026-12-24T10:00:00Z'),
        locale,
        t,
      }),
    );

    expectNoLeaks(html);
    expect(text(html)).toContain('Acme Sp. z o.o.');
    expect(text(html)).not.toContain('Grace Hopper');
  });

  it('magic-link invitation', async () => {
    const t = await getEmailTranslator(locale, 'invitation');
    const html = await render(
      MagicLinkInvitationEmail({
        ...props,
        role: 'admin',
        magicLinkUrl: 'https://app.example.test/magic?token=abc',
        locale,
        t,
      }),
    );

    expectNoLeaks(html);
    expect(html).toContain(`lang="${locale}"`);
    expect(text(html)).toContain(t('join'));
    expect(text(html)).toContain(t('role-admin'));
    expect(html).toContain('https://app.example.test/magic?token=abc');
  });

  it('password reset', async () => {
    const t = await getEmailTranslator(locale, 'password-reset');
    const html = await render(
      PasswordResetEmail({
        resetUrl: 'https://app.example.test/reset?token=abc',
        locale,
        t,
      }),
    );

    expectNoLeaks(html);
    expect(html).toContain(`lang="${locale}"`);
    expect(text(html)).toContain(t('button'));
    expect(html).toContain('https://app.example.test/reset?token=abc');
  });

  it('verification', async () => {
    const t = await getEmailTranslator(locale, 'verification');
    const html = await render(
      VerificationEmail({
        verificationUrl: 'https://app.example.test/verify?token=abc',
        locale,
        t,
      }),
    );

    expectNoLeaks(html);
    expect(text(html)).toContain(t('button'));
  });

  it('welcome, with and without a name', async () => {
    const t = await getEmailTranslator(locale, 'welcome');

    const named = await render(WelcomeEmail({ name: 'Ada', locale, t }));
    expectNoLeaks(named);
    expect(text(named)).toContain('Ada');
    expect(text(named)).toContain('hello@webamigos.pl');

    const anonymous = await render(
      WelcomeEmail({ name: undefined, locale, t }),
    );
    expectNoLeaks(anonymous);
    expect(text(anonymous)).toContain(t('greeting'));
  });

  it('security alert, with a known event and with one it has no label for', async () => {
    const t = await getEmailTranslator(locale, 'security-alert');
    const base = {
      publicId: 'evt_1',
      severity: 'critical',
      source: 'auth',
      organizationId: 'org_1',
      userId: 'user_1',
      ipAddress: '203.0.113.7',
      requestId: 'req_1',
      createdAtIso: '2026-10-04T10:00:00.000Z',
      locale,
      t,
    };

    const known = await render(
      SecurityAlertEmail({ ...base, eventType: 'AUTH_LOGIN_FAILED' }),
    );
    expectNoLeaks(known);
    expect(text(known)).toContain(
      messages(locale).emails['security-alert']['event-type'].AUTH_LOGIN_FAILED,
    );

    // A new event type must show up under its own name, not blank or as a key.
    const unknown = await render(
      SecurityAlertEmail({ ...base, eventType: 'SOMETHING_NEW_HAPPENED' }),
    );
    expectNoLeaks(unknown);
    expect(text(unknown)).toContain('SOMETHING_NEW_HAPPENED');
  });
});

describe('the languages differ from the Polish original', () => {
  const pl = messages('pl').emails;

  it.each(locales.filter((locale) => locale !== 'pl'))(
    '%s repeats no Polish sentence',
    (locale) => {
      const flat = (o: Record<string, any>, p = ''): [string, string][] =>
        Object.entries(o).flatMap(([k, v]) =>
          typeof v === 'string'
            ? [[p + k, v] as [string, string]]
            : flat(v, `${p}${k}.`),
        );
      const plFlat = new Map(flat(pl));

      // A short label can legitimately read the same in two languages ("API",
      // "MCP", "Chatbot"), so only sentences are held to this.
      const repeated = flat(messages(locale).emails)
        .filter(
          ([key, value]) => value.length > 20 && plFlat.get(key) === value,
        )
        .map(([key]) => key);

      expect(repeated).toEqual([]);
    },
  );
});
