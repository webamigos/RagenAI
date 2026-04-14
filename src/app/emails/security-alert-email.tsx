import { Heading, Section, Text, Link } from '@react-email/components';
import { EmailLayout } from './components/email-layout';
import { getBaseUrl } from './utils/base-url';

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
};

const SEVERITY_LABEL: Record<string, string> = {
  info: 'Info',
  warn: 'Warning',
  critical: 'Critical',
};

const SEVERITY_COLOR: Record<string, string> = {
  info: '#525f7f',
  warn: '#c2410c',
  critical: '#b91c1c',
};

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
}: Props) => {
  const color = SEVERITY_COLOR[severity] ?? '#525f7f';
  const label = SEVERITY_LABEL[severity] ?? severity;
  const incidentUrl = `${getBaseUrl()}/organization/security?highlight=${encodeURIComponent(
    publicId,
  )}`;

  return (
    <EmailLayout preview={`[${label}] ${eventType} — Ragen security alert`}>
      <Heading className="m-0 text-lg font-bold" style={{ color }}>
        [{label}] {eventType}
      </Heading>
      <Text className="text-sm leading-6 text-[#525f7f]">
        A security event was recorded on Ragen AI and reached the{' '}
        <strong>{label.toLowerCase()}</strong> threshold. Review the details
        below and acknowledge it in the admin panel.
      </Text>

      <Section className="my-5 rounded-[5px] border border-[#e6ebf1] bg-[#f9fafb] p-4">
        <Text className="m-0 text-sm leading-6 text-[#525f7f]">
          <strong>Event ID:</strong> {publicId}
          <br />
          <strong>Type:</strong> {eventType}
          <br />
          <strong>Severity:</strong> {label}
          <br />
          <strong>Source:</strong> {source}
          <br />
          <strong>Occurred at:</strong> {createdAtIso}
          {organizationId ? (
            <>
              <br />
              <strong>Organization:</strong> {organizationId}
            </>
          ) : null}
          {userId ? (
            <>
              <br />
              <strong>User:</strong> {userId}
            </>
          ) : null}
          {ipAddress ? (
            <>
              <br />
              <strong>IP address:</strong> {ipAddress}
            </>
          ) : null}
          {requestId ? (
            <>
              <br />
              <strong>Request ID:</strong> {requestId}
            </>
          ) : null}
        </Text>
      </Section>

      <Text className="text-sm leading-6 text-[#525f7f]">
        Open the incident:{' '}
        <Link href={incidentUrl} className="text-[#4f46e5]">
          {incidentUrl}
        </Link>
      </Text>
      <Text className="text-xs leading-5 text-[#8898aa]">
        You are receiving this message because your address is listed in the
        <code> SECURITY_ALERT_EMAIL</code> environment variable. This alert was
        triggered by a critical severity event. Lower severities are available
        in the admin panel and are not emailed.
      </Text>
    </EmailLayout>
  );
};

export { SecurityAlertEmail };
export default SecurityAlertEmail;
