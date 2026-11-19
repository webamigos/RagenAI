import { Button, Hr, Text } from '@react-email/components';
import type { EmailBranding } from '@/features/branding/contracts/branding.types';
import { EmailLayout } from './components/email-layout';
import type { EmailTranslator } from './utils/email-translator';
import { previewTranslator } from './utils/preview-translator';

type Props = {
  verificationUrl: string;
  locale: string;
  /** The `emails.verification` strings in `locale`. */
  t: EmailTranslator;
  /** The install's branding; absent is Ragen's (spec B2). */
  branding?: EmailBranding;
};

const VerificationEmail = ({ verificationUrl, locale, t, branding }: Props) => (
  <EmailLayout locale={locale} preview={t('preview')} branding={branding}>
    <Text className="text-base leading-6 text-[#525f7f]">{t('body')}</Text>
    <Button
      className="block w-full rounded-[5px] bg-[#394d9d] px-2.5 py-2.5 text-center text-base font-bold text-white no-underline"
      href={verificationUrl}
    >
      {t('button')}
    </Button>
    <Hr className="my-5 border-[#e6ebf1]" />
    <Text className="text-base leading-6 text-[#525f7f]">{t('ignore')}</Text>
    <Text className="text-base leading-6 text-[#525f7f]">{t('expiry')}</Text>
  </EmailLayout>
);

/** What `npm run emails:dev` renders this template with. */
VerificationEmail.PreviewProps = {
  verificationUrl: 'https://app.example.test/verify-email?token=preview',
  locale: 'en',
  t: previewTranslator('verification'),
} satisfies Props;

export { VerificationEmail };
export default VerificationEmail;
