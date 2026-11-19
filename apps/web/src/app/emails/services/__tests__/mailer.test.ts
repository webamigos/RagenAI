import { render } from '@react-email/render';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.hoisted(() => vi.fn());
const cookieGet = vi.hoisted(() => vi.fn());
const headerGet = vi.hoisted(() => vi.fn());
const emailBranding = vi.hoisted(() => vi.fn());

vi.mock('@/libs/mail', () => ({
  getMailProvider: () => ({ send }),
  getResendProvider: () => null,
}));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: cookieGet }),
  headers: async () => ({ get: headerGet }),
}));
vi.mock('../../utils/base-url', () => ({
  getBaseUrl: () => 'https://app.example.test',
}));
vi.mock(
  '@/features/branding/services/queries/get-email-branding-query',
  () => ({ getEmailBrandingQuery: () => emailBranding() }),
);

const RAGEN_BRANDING = {
  productName: 'Ragen AI',
  logoUrl: null,
  isCustom: false,
};

import {
  sendInvitationEmail,
  sendMagicLinkInvitationEmail,
  sendPasswordResetEmailViaMailer,
  sendSecurityAlertEmail,
  sendVerificationEmail,
  sendWelcomeEmail,
} from '../mailer';

/**
 * The subject lines, which are what a mail client shows before anything is
 * opened and were Polish for everyone (#1092). The body is covered per locale by
 * `emails-are-translated.test.tsx`; this is the part that picks the language.
 */

const sentSubject = () => send.mock.calls.at(-1)?.[0].subject as string;

describe('mailer subjects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieGet.mockReturnValue(undefined);
    headerGet.mockReturnValue(null);
    delete process.env.SECURITY_ALERT_LOCALE;
    process.env.SECURITY_ALERT_EMAIL = 'ops@example.com';
    emailBranding.mockResolvedValue(RAGEN_BRANDING);
  });

  it('writes an invitation subject in the locale it is given, with the organization', async () => {
    await sendInvitationEmail({
      to: 'a@b.co',
      organizationName: 'Acme',
      role: 'member',
      invitationId: 'inv_1',
      expiresAt: new Date('2026-12-24'),
      locale: 'de',
    });

    expect(sentSubject()).toBe('Einladung zu Acme bei Ragen AI');
  });

  it('carries the inviter’s language into the magic-link email', async () => {
    await sendMagicLinkInvitationEmail({
      to: 'a@b.co',
      magicLinkUrl: 'https://x.test/m',
      organizationName: 'Acme',
      role: 'member',
      locale: 'fr',
    });

    expect(sentSubject()).toBe('Invitation à rejoindre Acme sur Ragen AI');
  });

  it('takes the language from the request when none is named', async () => {
    cookieGet.mockReturnValue({ value: 'es' });

    await sendPasswordResetEmailViaMailer({
      to: 'a@b.co',
      resetUrl: 'https://x.test/r',
    });

    expect(sentSubject()).toBe('Restablece tu contraseña de Ragen');
  });

  it('falls back to Accept-Language, then to English', async () => {
    headerGet.mockReturnValue('it-IT,it;q=0.9');
    await sendVerificationEmail({
      to: 'a@b.co',
      verificationUrl: 'https://x.test/v',
    });
    expect(sentSubject()).toBe('Verifica il tuo indirizzo email – Ragen AI');

    headerGet.mockReturnValue(null);
    await sendWelcomeEmail({ to: 'a@b.co', name: 'Ada' });
    expect(sentSubject()).toBe('Welcome to Ragen!');
  });

  it('writes a security alert in SECURITY_ALERT_LOCALE, never in the request’s language', async () => {
    // The request that raised an alert may be an attacker's.
    cookieGet.mockReturnValue({ value: 'fr' });
    process.env.SECURITY_ALERT_LOCALE = 'pl';

    await sendSecurityAlertEmail({
      event: {
        publicId: 'evt_unique_1',
        eventType: 'AUTH_LOGIN_FAILED',
        severity: 'critical',
        source: 'auth',
        organizationId: null,
        userId: 'user_alert_1',
        ipAddress: null,
        requestId: null,
        createdAt: new Date('2026-10-04T10:00:00Z'),
      },
    });

    const mail = send.mock.calls.at(-1)?.[0];
    // The subject stays a machine-readable line, the same in every language.
    expect(mail.subject).toBe('[Ragen Security] CRITICAL: AUTH_LOGIN_FAILED');
    const html = await render(mail.react);
    expect(html).toContain('lang="pl"');
    expect(html).toContain('Nieudane logowanie');
  });

  it('ignores a SECURITY_ALERT_LOCALE the app does not ship', async () => {
    process.env.SECURITY_ALERT_LOCALE = 'xx';

    const result = await sendSecurityAlertEmail({
      event: {
        publicId: 'evt_unique_2',
        eventType: 'API_KEY_CREATED',
        severity: 'critical',
        source: 'api',
        organizationId: null,
        userId: 'user_alert_2',
        ipAddress: null,
        requestId: null,
        createdAt: new Date('2026-10-04T10:00:00Z'),
      },
    });

    expect(result).toEqual({ data: true });
  });

  it('reports a failure in English, not Polish', async () => {
    send.mockRejectedValueOnce(new Error('smtp down'));

    expect(await sendWelcomeEmail({ to: 'a@b.co', name: 'Ada' })).toEqual({
      error: 'Failed to send welcome email',
    });
  });
});

/**
 * Instance branding (spec B2): the subject, the masthead and the signature
 * carry the install's name, and nothing changes without it.
 */
describe('mailer branding', () => {
  const sentHtml = () =>
    render(send.mock.calls.at(-1)?.[0].react as React.ReactElement);

  beforeEach(() => {
    vi.clearAllMocks();
    cookieGet.mockReturnValue(undefined);
    headerGet.mockReturnValue(null);
  });

  it('keeps Ragen’s logo, name and signature with no branding', async () => {
    emailBranding.mockResolvedValue(RAGEN_BRANDING);

    await sendWelcomeEmail({ to: 'a@b.co', name: 'Ada', locale: 'en' });
    const html = await sentHtml();

    expect(html).toContain('ragen-logo-on-light-bg.svg');
    expect(html).toContain('Ragen AI by Web Amigos');
  });

  it('names the install in the subject and draws its logo', async () => {
    emailBranding.mockResolvedValue({
      productName: 'Acme Knowledge',
      logoUrl: 'https://app.example.test/api/branding/logo?v=1',
      isCustom: true,
    });

    await sendInvitationEmail({
      to: 'a@b.co',
      organizationName: 'Acme',
      role: 'member',
      invitationId: 'inv_1',
      expiresAt: new Date('2026-12-24'),
      locale: 'de',
    });
    const html = await sentHtml();

    expect(sentSubject()).toBe('Einladung zu Acme bei Acme Knowledge');
    expect(html).toContain('https://app.example.test/api/branding/logo?v=1');
    expect(html).not.toContain('ragen-logo-on-light-bg.svg');
    expect(html).not.toContain('Web Amigos');
  });

  it('writes the name as the masthead when there is no logo', async () => {
    emailBranding.mockResolvedValue({
      productName: 'Acme Knowledge',
      logoUrl: null,
      isCustom: true,
    });

    await sendPasswordResetEmailViaMailer({
      to: 'a@b.co',
      resetUrl: 'https://x.test/r',
      locale: 'en',
    });
    const html = await sentHtml();

    expect(html).toMatch(/<h1[^>]*>Acme Knowledge<\/h1>/);
    expect(html).not.toContain('ragen-logo-on-light-bg.svg');
  });
});
