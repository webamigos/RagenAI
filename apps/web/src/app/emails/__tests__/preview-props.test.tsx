import { render } from '@react-email/render';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../utils/base-url', () => ({
  getBaseUrl: () => 'https://app.example.test',
}));

import { InvitationEmail } from '../invitation-email';
import { MagicLinkInvitationEmail } from '../magic-link-invitation-email';
import { PasswordResetEmail } from '../password-reset-email';
import { SecurityAlertEmail } from '../security-alert-email';
import { VerificationEmail } from '../verification-email';
import { WelcomeEmail } from '../welcome-email';
import { previewTranslator } from '../utils/preview-translator';

/**
 * `npm run emails:dev` renders each template from its `PreviewProps`. Without
 * them a template has no translator and the preview shows an error instead of
 * the email, which is how the security alert looked before these existed.
 */

const templates = {
  InvitationEmail,
  MagicLinkInvitationEmail,
  PasswordResetEmail,
  SecurityAlertEmail,
  VerificationEmail,
  WelcomeEmail,
} as const;

describe('PreviewProps', () => {
  it.each(Object.entries(templates))(
    '%s renders from its own preview props',
    async (_name, Template) => {
      const props = (Template as { PreviewProps?: object }).PreviewProps;
      expect(props).toBeDefined();

      const html = await render(
        (Template as (p: object) => React.ReactElement)(props!),
      );

      expect(html).toContain('lang="en"');
      expect(html).not.toMatch(/emails\.[a-z-]+\./); // a raw message key
      expect(html).not.toMatch(/\{[a-zA-Z]+\}/); // an unfilled placeholder
      expect(html).not.toContain('undefined');
    },
  );
});

describe('previewTranslator', () => {
  it('reads the English email messages for a namespace', () => {
    const t = previewTranslator('welcome');

    expect(t.has('button')).toBe(true);
    expect(t('button')).not.toBe('button');
  });

  it('reports a key that does not exist rather than inventing one', () => {
    expect(previewTranslator('security-alert').has('event-type.NOPE')).toBe(
      false,
    );
  });
});
