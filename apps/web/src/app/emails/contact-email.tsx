import { Text } from '@react-email/components';
import { EmailLayout } from './components/email-layout';

type Props = {
  email: string;
  message: string;
  category?: string;
};

const ContactEmail = ({ email, message, category }: Props) => (
  <EmailLayout preview={`Nowe zgłoszenie od ${email}`}>
    <Text className="text-lg font-semibold leading-6 text-[#525f7f]">
      Nowe zgłoszenie od {email}
    </Text>
    <Text className="text-base leading-6 text-[#525f7f]">
      <strong>Email:</strong> {email}
    </Text>
    {category && (
      <Text className="text-base leading-6 text-[#525f7f]">
        <strong>Kategoria:</strong> {category}
      </Text>
    )}
    <Text className="text-base leading-6 text-[#525f7f]">
      <strong>Wiadomość:</strong>
    </Text>
    <Text className="text-base leading-6 text-[#525f7f]">{message}</Text>
  </EmailLayout>
);

export { ContactEmail };
export default ContactEmail;
