import { Heading, Section, Text, Link } from '@react-email/components';
import { EmailLayout } from './components/email-layout';
import { getBaseUrl } from './utils/base-url';
import { code, strong, type EmailTranslator } from './utils/email-translator';
import { previewTranslator } from './utils/preview-translator';

type Props = {
  publicId: string;
  eventType: string;
  severity: string;
  source: string;
  organizationId: string | null;
  userId: string | null;
  ipAddress: string | null;
  requestId: string | null;
  createdAtIso: string;
  locale: string;
  /** The `emails.security-alert` strings in `locale`. */
  t: EmailTranslator;
};

const SEVERITY_COLOR: Record<string, string> = {
  info: '#525f7f',
  warn: '#c2410c',
  critical: '#b91c1c',
};

/**
 * A label from the messages for a value the application defines, or the value
 * itself when it has no label yet: a new event type must still show up in an
 * alert as its own name rather than as a raw translation key or a blank.
 */
const labelFor = (t: EmailTranslator, group: string, value: string) =>
  t.has(`${group}.${value}`) ? t(`${group}.${value}`) : value;

const SecurityAlertEmail = ({
  publicId,
  eventType,
  severity,
  source,
  organizationId,
  userId,
  ipAddress,
  requestId,
  createdAtIso,
  locale,
  t,
}: Props) => {
  const color = SEVERITY_COLOR[severity] ?? '#525f7f';
  const label = labelFor(t, 'severity', severity);
  const eventTypeLabel = labelFor(t, 'event-type', eventType);
  const sourceLabel = labelFor(t, 'source', source);
  const incidentUrl = `${getBaseUrl()}/organization/security?highlight=${encodeURIComponent(
    publicId,
  )}`;

  return (
    <EmailLayout
      locale={locale}
      preview={t('preview', { severity: label, event: eventTypeLabel })}
    >
      <Heading className="m-0 text-lg font-bold" style={{ color }}>
        [{label}] {eventTypeLabel}
      </Heading>
      <Text className="text-sm leading-6 text-[#525f7f]">
        {t.rich('intro', { severity: label.toLowerCase(), strong })}
      </Text>

      <Section className="my-5 rounded-[5px] border border-[#e6ebf1] bg-[#f9fafb] p-4">
        <Text className="m-0 text-sm leading-6 text-[#525f7f]">
          <strong>{t('label-id')}:</strong> {publicId}
          <br />
          <strong>{t('label-type')}:</strong> {eventTypeLabel}
          <br />
          <strong>{t('label-severity')}:</strong> {label}
          <br />
          <strong>{t('label-source')}:</strong> {sourceLabel}
          <br />
          <strong>{t('label-time')}:</strong> {createdAtIso}
          {organizationId ? (
            <>
              <br />
              <strong>{t('label-organization')}:</strong> {organizationId}
            </>
          ) : null}
          {userId ? (
            <>
              <br />
              <strong>{t('label-user')}:</strong> {userId}
            </>
          ) : null}
          {ipAddress ? (
            <>
              <br />
              <strong>{t('label-ip')}:</strong> {ipAddress}
            </>
          ) : null}
          {requestId ? (
            <>
              <br />
              <strong>{t('label-request')}:</strong> {requestId}
            </>
          ) : null}
        </Text>
      </Section>

      <Text className="text-sm leading-6 text-[#525f7f]">
        {t('open')}{' '}
        <Link href={incidentUrl} className="text-[#394d9d]">
          {incidentUrl}
        </Link>
      </Text>
      <Text className="text-xs leading-5 text-[#8898aa]">
        {t.rich('footer', { code })}
      </Text>
    </EmailLayout>
  );
};

/** What `npm run emails:dev` renders this template with. */
SecurityAlertEmail.PreviewProps = {
  publicId: 'evt_preview',
  eventType: 'AUTH_LOGIN_FAILED',
  severity: 'critical',
  source: 'auth',
  organizationId: 'org_preview',
  userId: 'user_preview',
  ipAddress: '203.0.113.7',
  requestId: 'req_preview',
  createdAtIso: '2026-10-04T10:00:00.000Z',
  locale: 'en',
  t: previewTranslator('security-alert'),
} satisfies Props;

export { SecurityAlertEmail };
export default SecurityAlertEmail;
