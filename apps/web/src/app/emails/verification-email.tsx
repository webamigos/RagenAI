import { Button, Hr, Text } from '@react-email/components';
import { EmailLayout } from './components/email-layout';

type Props = {
  verificationUrl: string;
};

const VerificationEmail = ({ verificationUrl }: Props) => (
  <EmailLayout preview="Zweryfikuj swój adres email w Ragen AI">
    <Text className="text-base leading-6 text-[#525f7f]">
      Dziękujemy za rejestrację w Ragen AI! Kliknij poniższy przycisk, aby
      zweryfikować swój adres email:
    </Text>
    <Button
      className="block w-full rounded-[5px] bg-[#4f46e5] px-2.5 py-2.5 text-center text-base font-bold text-white no-underline"
      href={verificationUrl}
    >
      Zweryfikuj email
    </Button>
    <Hr className="my-5 border-[#e6ebf1]" />
    <Text className="text-base leading-6 text-[#525f7f]">
      Jeśli nie zakładałeś konta w Ragen AI, zignoruj tę wiadomość.
    </Text>
    <Text className="text-base leading-6 text-[#525f7f]">
      Link wygaśnie za 24 godziny.
    </Text>
  </EmailLayout>
);

export { VerificationEmail };
export default VerificationEmail;
