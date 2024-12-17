interface Props {
  firstName: string;
}

export const EmailTemplate = ({ firstName }: Props) => (
  <div>
    <h1>Welcome, {firstName}!</h1>
  </div>
);
