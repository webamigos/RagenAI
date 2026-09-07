import { Button, Hr, Text } from '@react-email/components';
import { ORG_ADMIN_ROLE } from '@ragenai/platform-contracts';
import { EmailLayout } from './components/email-layout';

type Props = {
  invitedEmail: string;
  organizationName: string;
  inviterName?: string;
  role: string;
  magicLinkUrl: string;
};

const MagicLinkInvitationEmail = ({
  invitedEmail,
  organizationName,
  inviterName,
  role,
  magicLinkUrl,
}: Props) => {
  const roleLabel = role === ORG_ADMIN_ROLE ? 'Administrator' : 'Członek';

  return (
    <EmailLayout
      preview={`Otrzymałeś zaproszenie do organizacji ${organizationName} w Ragen AI`}
    >
      <Text className="text-base leading-6 text-[#525f7f]">Cześć!</Text>
      {inviterName ? (
        <Text className="text-base leading-6 text-[#525f7f]">
          <strong>{inviterName}</strong> zaprasza Cię do dołączenia do
          organizacji <strong>{organizationName}</strong> w Ragen AI.
        </Text>
      ) : (
        <Text className="text-base leading-6 text-[#525f7f]">
          Otrzymałeś zaproszenie do organizacji{' '}
          <strong>{organizationName}</strong> w Ragen AI.
        </Text>
      )}
      <Text className="text-base leading-6 text-[#525f7f]">
        Zostaniesz dodany z rolą: <strong>{roleLabel}</strong>
      </Text>
      <Button
        className="block w-full rounded-[5px] bg-[#394d9d] px-2.5 py-2.5 text-center text-base font-bold text-white no-underline"
        href={magicLinkUrl}
      >
        Dołącz do organizacji
      </Button>
      <Text className="mt-4 text-sm leading-5 text-[#8898aa]">
        Kliknięcie tego przycisku zaloguje Cię automatycznie — bez konieczności
        zapamiętywania hasła. Link wygasa po 7 dniach.
      </Text>
      <Hr className="my-5 border-[#e6ebf1]" />
      <Text className="text-base leading-6 text-[#525f7f]">
        Jeśli nie chcesz dołączyć do tej organizacji, zignoruj tę wiadomość.
      </Text>
      <Hr className="my-5 border-[#e6ebf1]" />
      <Text className="text-xs leading-4 text-[#8898aa]">
        Zaproszenie wysłane na adres: {invitedEmail}
      </Text>
    </EmailLayout>
  );
};

export { MagicLinkInvitationEmail };
export default MagicLinkInvitationEmail;
