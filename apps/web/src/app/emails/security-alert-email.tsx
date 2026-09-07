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

const EVENT_TYPE_LABEL: Record<string, string> = {
  AUTH_LOGIN_FAILED: 'Nieudane logowanie',
  AUTH_BRUTEFORCE_SUSPECTED: 'Podejrzenie ataku brute-force',
  AUTH_PASSWORD_RESET_REQUESTED: 'Żądanie resetowania hasła',
  AUTH_ADMIN_ROLE_GRANTED: 'Przyznano rolę administratora',
  AUTH_ADMIN_ROLE_REVOKED: 'Odebrano rolę administratora',
  API_KEY_CREATED: 'Klucz API utworzony',
  API_KEY_REVOKED: 'Klucz API odwołany',
  API_INTERNAL_SECRET_MISMATCH: 'Niezgodność sekretu wewnętrznego API',
  CROSS_ORG_ACCESS_ATTEMPTED: 'Próba dostępu między organizacjami',
  UNAUTHORIZED_ACCESS_ATTEMPTED: 'Próba nieautoryzowanego dostępu',
  CHAT_JAILBREAK_DETECTED: 'Wykryto próbę jailbreak',
  CHAT_PII_DETECTED: 'Wykryto dane osobowe w czacie',
  CHAT_PII_MASKING_FAILED: 'Błąd maskowania danych osobowych',
  TOOL_CALL_BLOCKED: 'Wywołanie narzędzia zablokowane',
  TOOL_CALL_CONFIRMED: 'Wywołanie narzędzia potwierdzone',
  TOOL_CALL_DENIED: 'Wywołanie narzędzia odrzucone',
  TOOL_ARGS_HIGH_RISK: 'Argumenty narzędzia wysokiego ryzyka',
  UPLOAD_SUSPICIOUS_CONTENT: 'Podejrzana treść w przesłanym pliku',
  UPLOAD_REJECTED: 'Przesłany plik odrzucony',
  ADMIN_SETTINGS_CHANGED: 'Zmiana ustawień administracyjnych',
  RATE_LIMIT_HIT: 'Przekroczono limit zapytań',
  MCP_OAUTH_FAILED: 'Błąd autoryzacji OAuth MCP',
};

const SOURCE_LABEL: Record<string, string> = {
  auth: 'Uwierzytelnianie',
  chat: 'Czat',
  chatbot: 'Chatbot',
  upload: 'Przesyłanie pliku',
  admin: 'Panel administracyjny',
  api: 'API',
  mcp: 'MCP',
  infra: 'Infrastruktura',
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
  const eventTypeLabel = EVENT_TYPE_LABEL[eventType] ?? eventType;
  const sourceLabel = SOURCE_LABEL[source] ?? source;
  const incidentUrl = `${getBaseUrl()}/organization/security?highlight=${encodeURIComponent(
    publicId,
  )}`;

  return (
    <EmailLayout
      preview={`[${label}] ${eventTypeLabel} — alert bezpieczeństwa Ragen`}
    >
      <Heading className="m-0 text-lg font-bold" style={{ color }}>
        [{label}] {eventTypeLabel}
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
          <strong>Typ:</strong> {eventTypeLabel}
          <br />
          <strong>Poziom:</strong> {label}
          <br />
          <strong>Źródło:</strong> {sourceLabel}
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
        <Link href={incidentUrl} className="text-[#394d9d]">
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
