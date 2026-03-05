import { Button, Hr, Text } from '@react-email/components';
import { EmailLayout } from './components/email-layout';
import { getBaseUrl } from './utils/base-url';

type Props = {
  name: string | undefined;
};

const WelcomeEmail = ({ name }: Props) => (
  <EmailLayout preview="Korzystaj w bezpieczny sposób z AI w swojej firmie">
    <Text className="text-base leading-6 text-[#525f7f]">
      Cześć{name ? ` ${name}` : ''}!
    </Text>
    <Text className="text-base leading-6 text-[#525f7f]">
      Dziękujemy za rejestrację w Ragen AI :)
    </Text>
    <Text className="text-base leading-6 text-[#525f7f]">
      Pracujemy nad tym projektem, aby pomóc w łatwy sposób budować asystentów
      AI.
    </Text>
    <Text className="text-base leading-6 text-[#525f7f]">
      W najbliższym czasie będziemy rozwijać nasze rozwiązanie, więc warto dodać
      ten adres e-mail do kontaktów - nie ominą Cię wtedy informacje o nowych
      funkcjonalnościach.
    </Text>
    <Button
      className="block w-full rounded-[5px] bg-[#4f46e5] px-2.5 py-2.5 text-center text-base font-bold text-white no-underline"
      href={getBaseUrl()}
    >
      Przejdź do aplikacji Ragen
    </Button>
    <Hr className="my-5 border-[#e6ebf1]" />
    <Text className="text-base leading-6 text-[#525f7f]">
      Jeśli masz jakieś pytania, prośby lub pomysły związane z działaniem
      aplikacji, to śmiało napisz na adres hello@webamigos.pl.
    </Text>
  </EmailLayout>
);

export { WelcomeEmail };
export default WelcomeEmail;
