import {
  invitationEmailLog,
  invitationErrorLog,
  passwordResetEmailLog,
} from '../auth-email-log';

describe('authentication email log fields', () => {
  it('masks the password-reset recipient', () => {
    expect(passwordResetEmailLog('alice@example.com')).toEqual({
      to: 'a***@example.com',
    });
  });

  it('masks invitation recipients and excludes the full payload on errors', () => {
    const email = 'alice@example.com';
    expect(invitationEmailLog(email)).toEqual({ email: 'a***@example.com' });
    expect(
      invitationErrorLog(
        { email, organizationName: 'Acme', id: 'invite-1' },
        new Error('SMTP unavailable'),
      ),
    ).toMatchObject({
      to: 'a***@example.com',
      organizationName: 'Acme',
      invitationId: 'invite-1',
    });
    expect(
      JSON.stringify(
        invitationErrorLog(
          { email, organizationName: 'Acme', id: 'invite-1' },
          new Error('SMTP unavailable'),
        ),
      ),
    ).not.toContain(email);
  });
});
