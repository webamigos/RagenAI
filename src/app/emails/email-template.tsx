interface Props {
  firstName: string;
}

export const EmailTemplate = ({ firstName }: Props) => (
  <div>
    <h1>Welcome, {firstName}!</h1>
  </div>
);

interface ContactEmailProps {
  email: string;
  message: string;
}

export const ContactEmail = ({ email, message }: ContactEmailProps) => {
  return (
    <div
      style={{
        fontFamily: 'Arial, sans-serif',
        lineHeight: '1.6',
        color: '#333',
      }}
    >
      <h2>Nowe zgłoszenie od {email}</h2>
      <p>
        <strong>Email:</strong> {email}
      </p>
      <p>
        <strong>Wiadomość:</strong>
      </p>
      <p>{message}</p>
    </div>
  );
};

export const getUserResponseEmailContent = (title: string, message: string) => {
  return {
    subject: `Kopia Twojej wiadomości: ${title}`,
    text: `Dziękujemy za kontakt z Ragen!\n\nOtrzymaliśmy Twoją wiadomość:\n\n${message}\n\nSkontaktujemy się z Tobą wkrótce.`,
  };
};
