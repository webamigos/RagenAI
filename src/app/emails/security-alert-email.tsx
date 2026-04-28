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
  info: 'Informacja',
  warn: 'Ostrzeżenie',
  critical: 'Krytyczne',
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
    <EmailLayout
      preview={`[${label}] ${eventType} — alert bezpieczeństwa Ragen`}
    >
      <Heading className="m-0 text-lg font-bold" style={{ color }}>
        [{label}] {eventType}
      </Heading>
      <Text className="text-sm leading-6 text-[#525f7f]">
        W systemie Ragen AI zarejestrowano zdarzenie bezpieczeństwa o poziomie{' '}
        <strong>{label.toLowerCase()}</strong>. Przejrzyj szczegóły poniżej i
        potwierdź jego obsługę w panelu administracyjnym.
      </Text>

      <Section className="my-5 rounded-[5px] border border-[#e6ebf1] bg-[#f9fafb] p-4">
        <Text className="m-0 text-sm leading-6 text-[#525f7f]">
          <strong>ID zdarzenia:</strong> {publicId}
          <br />
          <strong>Typ:</strong> {eventType}
          <br />
          <strong>Poziom:</strong> {label}
          <br />
          <strong>Źródło:</strong> {source}
          <br />
          <strong>Czas zdarzenia:</strong> {createdAtIso}
          {organizationId ? (
            <>
              <br />
              <strong>Organizacja:</strong> {organizationId}
            </>
          ) : null}
          {userId ? (
            <>
              <br />
              <strong>Użytkownik:</strong> {userId}
            </>
          ) : null}
          {ipAddress ? (
            <>
              <br />
              <strong>Adres IP:</strong> {ipAddress}
            </>
          ) : null}
          {requestId ? (
            <>
              <br />
              <strong>ID żądania:</strong> {requestId}
            </>
          ) : null}
        </Text>
      </Section>

      <Text className="text-sm leading-6 text-[#525f7f]">
        Otwórz zdarzenie w panelu:{' '}
        <Link href={incidentUrl} className="text-[#4f46e5]">
          {incidentUrl}
        </Link>
      </Text>
      <Text className="text-xs leading-5 text-[#8898aa]">
        Otrzymujesz tę wiadomość, ponieważ Twój adres jest skonfigurowany w
        zmiennej środowiskowej <code>SECURITY_ALERT_EMAIL</code>. Alert został
        wywołany przez zdarzenie o poziomie krytycznym. Zdarzenia o niższych
        poziomach są dostępne wyłącznie w panelu administracyjnym.
      </Text>
    </EmailLayout>
  );
};

export { SecurityAlertEmail };
export default SecurityAlertEmail;
