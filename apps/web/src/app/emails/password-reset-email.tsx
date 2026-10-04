import { Button, Hr, Text } from '@react-email/components';
import { EmailLayout } from './components/email-layout';
import type { EmailTranslator } from './utils/email-translator';
import { previewTranslator } from './utils/preview-translator';

type Props = {
  resetUrl: string;
  locale: string;
  /** The `emails.password-reset` strings in `locale`. */
  t: EmailTranslator;
};

const PasswordResetEmail = ({ resetUrl, locale, t }: Props) => (
  <EmailLayout locale={locale} preview={t('preview')}>
    <Text className="text-base leading-6 text-[#525f7f]">{t('body')}</Text>
    <Button
      className="block w-full rounded-[5px] bg-[#394d9d] px-2.5 py-2.5 text-center text-base font-bold text-white no-underline"
      href={resetUrl}
    >
      {t('button')}
    </Button>
    <Hr className="my-5 border-[#e6ebf1]" />
    <Text className="text-base leading-6 text-[#525f7f]">{t('ignore')}</Text>
    <Text className="text-base leading-6 text-[#525f7f]">{t('expiry')}</Text>
  </EmailLayout>
);

/** What `npm run emails:dev` renders this template with. */
PasswordResetEmail.PreviewProps = {
  resetUrl: 'https://app.example.test/reset-password?token=preview',
  locale: 'en',
  t: previewTranslator('password-reset'),
} satisfies Props;

export { PasswordResetEmail };
export default PasswordResetEmail;
