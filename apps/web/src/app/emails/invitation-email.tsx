import { Button, Hr, Text } from '@react-email/components';
import { ORG_ADMIN_ROLE } from '@ragenai/platform-contracts';
import { EmailLayout } from './components/email-layout';
import { getBaseUrl } from './utils/base-url';
import { strong, type EmailTranslator } from './utils/email-translator';

type Props = {
  invitedEmail: string;
  organizationName: string;
  inviterName?: string;
  role: string;
  invitationId: string;
  expiresAt: Date;
  locale: string;
  /** The `emails.invitation` strings in `locale`. */
  t: EmailTranslator;
};

const InvitationEmail = ({
  invitedEmail,
  organizationName,
  inviterName,
  role,
  invitationId,
  expiresAt,
  locale,
  t,
}: Props) => {
  const acceptUrl = `${getBaseUrl()}/accept-invitation?token=${invitationId}`;
  const expiryDate = new Date(expiresAt).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const roleLabel =
    role === ORG_ADMIN_ROLE ? t('role-admin') : t('role-member');

  return (
    <EmailLayout
      locale={locale}
      preview={t('preview', { organization: organizationName })}
    >
      <Text className="text-base leading-6 text-[#525f7f]">
        {t('greeting')}
      </Text>
      <Text className="text-base leading-6 text-[#525f7f]">
        {inviterName
          ? t.rich('invited-by', {
              inviter: inviterName,
              organization: organizationName,
              strong,
            })
          : t.rich('invited', { organization: organizationName, strong })}
      </Text>
      <Text className="text-base leading-6 text-[#525f7f]">
        {t.rich('role', { role: roleLabel, strong })}
      </Text>
      <Button
        className="block w-full rounded-[5px] bg-[#394d9d] px-2.5 py-2.5 text-center text-base font-bold text-white no-underline"
        href={acceptUrl}
      >
        {t('accept')}
      </Button>
      <Hr className="my-5 border-[#e6ebf1]" />
      <Text className="text-base leading-6 text-[#525f7f]">
        {t.rich('expires', { date: expiryDate, strong })}
      </Text>
      <Text className="text-base leading-6 text-[#525f7f]">{t('ignore')}</Text>
      <Hr className="my-5 border-[#e6ebf1]" />
      <Text className="text-xs leading-4 text-[#8898aa]">
        {t('sent-to', { email: invitedEmail })}
      </Text>
    </EmailLayout>
  );
};

export { InvitationEmail };
export default InvitationEmail;
