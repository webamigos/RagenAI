import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
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
    <Preview>
      You&apos;re now ready to boost your productivity with Ragen!
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
          <Text style={paragraph}>Cześć{name ? ` ${name}` : ''}!</Text>
          <Text style={paragraph}>Dziękujemy za rejestrację w Ragen AI :)</Text>
          <Text style={paragraph}>
            Pracujemy nad tym projektem, aby pomóc programistom i programistkom
            szybciej tworzyć aplikacje z wykorzystujące modele AI.
          </Text>
          <Text style={paragraph}>
            W najbliższym czasie będziemy rozwijać nasze rozwiązanie, więc warto
            dodać ten adres e-mail do kontaktów - nie ominą Cię wtedy informacje
            o nowych funkcjonalnościach.
          </Text>
          <Text style={paragraphStrong}>
            Zanim w pełni zaczniesz wykorzystywać Ragen musisz wykonać dwa
            kroki:
          </Text>
          <Text style={paragraph}>
            1) Wygeneruj{' '}
            <Link style={anchor} href="https://platform.openai.com/api-keys">
              klucz API w OpenAI
            </Link>
            . Jest potrzebny do przeprocesowania Twoich dokumentów oraz
            wyszukiwania w nich powiązanych informacji. Następnie wprowadź klucz
            w{' '}
            <Link
              style={anchor}
              href={`${getBaseUrl()}/pl/my-profile/prompt-management`}
            >
              ustawieniach organizacji
            </Link>{' '}
            (kliknij w kłódkę po prawej stronie).
          </Text>
          <Text style={paragraph}>2) Zacznij dodawać swoje dokumenty :)</Text>
          <Text style={paragraph}> To wszystko - efektywnej pracy!</Text>
          <Button style={button} href={getBaseUrl()}>
            Przejdź do panelu Ragen
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

const paragraphStrong = {
  ...paragraph,
  fontWeight: 'bold',
};

const anchor = {
  color: '#4f46e5',
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
