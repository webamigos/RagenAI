import { Button, Hr, Text } from '@react-email/components';
import { ORG_ADMIN_ROLE } from '@ragenai/platform-contracts';
import { EmailLayout } from './components/email-layout';
import { strong, type EmailTranslator } from './utils/email-translator';

type Props = {
  invitedEmail: string;
  organizationName: string;
  inviterName?: string;
  role: string;
  magicLinkUrl: string;
  locale: string;
  /** The `emails.invitation` strings in `locale`, shared with the other invitation. */
  t: EmailTranslator;
};

const MagicLinkInvitationEmail = ({
  invitedEmail,
  organizationName,
  inviterName,
  role,
  magicLinkUrl,
  locale,
  t,
}: Props) => {
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
        href={magicLinkUrl}
      >
        {t('join')}
      </Button>
      <Text className="mt-4 text-sm leading-5 text-[#8898aa]">
        {t('magic-note')}
      </Text>
      <Hr className="my-5 border-[#e6ebf1]" />
      <Text className="text-base leading-6 text-[#525f7f]">{t('ignore')}</Text>
      <Hr className="my-5 border-[#e6ebf1]" />
      <Text className="text-xs leading-4 text-[#8898aa]">
        {t('sent-to', { email: invitedEmail })}
      </Text>
    </EmailLayout>
  );
};

export { MagicLinkInvitationEmail };
export default MagicLinkInvitationEmail;
