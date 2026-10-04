import { Button, Hr, Text } from '@react-email/components';
import { EmailLayout } from './components/email-layout';
import { getBaseUrl } from './utils/base-url';
import type { EmailTranslator } from './utils/email-translator';

/** Where a new user's questions go. Not translated: it is an address. */
const CONTACT_EMAIL = 'hello@webamigos.pl';

type Props = {
  name: string | undefined;
  locale: string;
  /** The `emails.welcome` strings in `locale`. */
  t: EmailTranslator;
};

const WelcomeEmail = ({ name, locale, t }: Props) => (
  <EmailLayout locale={locale} preview={t('preview')}>
    <Text className="text-base leading-6 text-[#525f7f]">
      {name ? t('greeting-named', { name }) : t('greeting')}
    </Text>
    <Text className="text-base leading-6 text-[#525f7f]">{t('thanks')}</Text>
    <Text className="text-base leading-6 text-[#525f7f]">{t('mission')}</Text>
    <Text className="text-base leading-6 text-[#525f7f]">
      {t('contacts-tip')}
    </Text>
    <Button
      className="block w-full rounded-[5px] bg-[#394d9d] px-2.5 py-2.5 text-center text-base font-bold text-white no-underline"
      href={getBaseUrl()}
    >
      {t('button')}
    </Button>
    <Hr className="my-5 border-[#e6ebf1]" />
    <Text className="text-base leading-6 text-[#525f7f]">
      {t('questions', { email: CONTACT_EMAIL })}
    </Text>
  </EmailLayout>
);

export { WelcomeEmail };
export default WelcomeEmail;
