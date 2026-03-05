import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import { getBaseUrl } from './utils/base-url';

type Props = {
  invitedEmail: string;
  organizationName: string;
  inviterName?: string;
  role: string;
  invitationId: string;
  expiresAt: Date;
};

const InvitationEmail = ({
  invitedEmail,
  organizationName,
  inviterName,
  role,
  invitationId,
  expiresAt,
}: Props) => {
  const acceptUrl = `${getBaseUrl()}/accept-invitation?token=${invitationId}`;
  const expiryDate = new Date(expiresAt).toLocaleDateString('pl-PL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const roleLabel = role === 'admin' ? 'Administrator' : 'Członek';

  return (
    <Html>
      <Head />
      <Preview>
        Otrzymałeś zaproszenie do organizacji {organizationName} w Ragen AI
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={box} align="center">
            <Img
              src="https://wkjfuiqjfrswdnpqybbb.supabase.co/storage/v1/object/public/assets/ragen-logo-on-light-bg_x180.png"
              width={180}
              height={64}
              alt="Ragen AI"
            />
            <Hr style={hr} />
            <Text style={paragraph}>Cześć!</Text>
            {inviterName ? (
              <Text style={paragraph}>
                <strong>{inviterName}</strong> zaprasza Cię do dołączenia do
                organizacji <strong>{organizationName}</strong> w Ragen AI.
              </Text>
            ) : (
              <Text style={paragraph}>
                Otrzymałeś zaproszenie do organizacji{' '}
                <strong>{organizationName}</strong> w Ragen AI.
              </Text>
            )}
            <Text style={paragraph}>
              Zostaniesz dodany z rolą: <strong>{roleLabel}</strong>
            </Text>
            <Button style={button} href={acceptUrl}>
              Zaakceptuj zaproszenie
            </Button>
            <Hr style={hr} />
            <Text style={paragraph}>
              To zaproszenie wygasa <strong>{expiryDate}</strong>.
            </Text>
            <Text style={paragraph}>
              Jeśli nie chcesz dołączyć do tej organizacji, zignoruj tę
              wiadomość.
            </Text>
            <Text style={paragraph}>— Zespół Ragen AI</Text>
            <Hr style={hr} />
            <Text style={footer}>
              Zaproszenie wysłane na adres: {invitedEmail}
            </Text>
            <Text style={footer}>Ragen by Web Amigos</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
};

const box = {
  padding: '0 48px',
};

const hr = {
  borderColor: '#e6ebf1',
  margin: '20px 0',
};

const paragraph = {
  color: '#525f7f',
  fontSize: '16px',
  lineHeight: '24px',
  textAlign: 'left' as const,
};

const button = {
  backgroundColor: '#4f46e5',
  borderRadius: '5px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  width: '100%',
  padding: '10px',
};

const footer = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
};

export { InvitationEmail };
export default InvitationEmail;
