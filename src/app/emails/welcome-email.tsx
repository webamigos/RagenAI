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
// below is a link to staging assets bucket on Supabase. I didn't used production because not sure
// if exposing Supabase project id is secure

type Props = {
  name: string | undefined;
};

export const WelcomeEmail = ({ name }: Props) => (
  <Html>
    <Head />
    <Preview>Korzystaj w bezpieczny sposób z AI w swojej firmie</Preview>
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
          <Text style={paragraph}>Cześć{name ? ` ${name}` : ''}!</Text>
          <Text style={paragraph}>Dziękujemy za rejestrację w Ragen AI :)</Text>
          <Text style={paragraph}>
            Pracujemy nad tym projektem, aby pomóc w łatwy sposób
            budować asystentów AI.
          </Text>
          <Text style={paragraph}>
            W najbliższym czasie będziemy rozwijać nasze rozwiązanie, więc warto
            dodać ten adres e-mail do kontaktów - nie ominą Cię wtedy informacje
            o nowych funkcjonalnościach.
          </Text>
          <Button style={button} href={getBaseUrl()}>
            Przejdź do aplikacji Ragen
          </Button>
          <Hr style={hr} />
          <Text style={paragraph}>
            Jeśli masz jakieś pytania, prośby lub pomysły związane z działaniem
            aplikacji, to śmiało odpisz na tego maila.
          </Text>
          <Text style={paragraph}>— Zespół Ragen AI</Text>
          <Hr style={hr} />
          <Text style={footer}>Ragen by Web Amigos</Text>
        </Section>
      </Container>
    </Body>
  </Html>
);

// TODO: hypothetically this ugly styles can be replaced to Tailwind classes - to check
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
