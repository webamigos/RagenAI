import { Button, Hr, Text } from '@react-email/components';
import { EmailLayout } from './components/email-layout';

type Props = {
  resetUrl: string;
};

const PasswordResetEmail = ({ resetUrl }: Props) => (
  <EmailLayout preview="Zresetuj hasło do Ragen">
    <Text className="text-base leading-6 text-[#525f7f]">
      Kliknij poniższy przycisk, aby zresetować swoje hasło:
    </Text>
    <Button
      className="block w-full rounded-[5px] bg-[#4f46e5] px-2.5 py-2.5 text-center text-base font-bold text-white no-underline"
      href={resetUrl}
    >
      Zresetuj hasło
    </Button>
    <Hr className="my-5 border-[#e6ebf1]" />
    <Text className="text-base leading-6 text-[#525f7f]">
      Jeśli nie prosiłeś o reset hasła, zignoruj tę wiadomość.
    </Text>
    <Text className="text-base leading-6 text-[#525f7f]">
      Link wygaśnie za 1 godzinę.
    </Text>
  </EmailLayout>
);

export { PasswordResetEmail };
export default PasswordResetEmail;
