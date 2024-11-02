import { type ClerkAPIError } from '@clerk/types';
import { useTranslations } from 'next-intl';

type Props = {
  apiErrors: ClerkAPIError[];
};

export const ClerkErrorsInterface = ({ apiErrors }: Props) => {
  const t = useTranslations('clerk-api-errors');

  if (!apiErrors || apiErrors.length === 0) {
    return null;
  }

  return (
    <ul className="mb-2 text-red-500 text-sm">
      {apiErrors.map((error, index) => {
        const translatedMessage = t(error.code);
        const translationDoesNotExist = translatedMessage.includes(error.code);

        const displayMessage = translationDoesNotExist
          ? error.longMessage ?? error.message
          : translatedMessage;

        return <li key={error.code || index}>{displayMessage}</li>;
      })}
    </ul>
  );
};
