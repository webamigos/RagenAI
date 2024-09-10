import { type ClerkAPIError } from '@clerk/types';

type Props = {
  apiErrors: ClerkAPIError[];
};

export const ClerkErrorsInterface = ({ apiErrors }: Props) => {
  if (!apiErrors || apiErrors.length === 0) {
    return null;
  }

  return (
    <ul className="mb-2 text-red-500 text-sm">
      {apiErrors.map((error, index) => (
        <li key={index}>{error.longMessage || error.message}</li>
      ))}
    </ul>
  );
};
