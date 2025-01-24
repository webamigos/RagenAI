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
