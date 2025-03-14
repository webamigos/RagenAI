import { useTranslations } from 'next-intl';
import { useClerk } from '@clerk/nextjs';
import { Button } from '@ragenai/common-ui/Button';
import { Text } from '@ragenai/common-ui/Text';

export const Misconfigured = () => {
  const t = useTranslations('account-configuration');
  const { signOut } = useClerk();

  return (
    <div className="flex flex-col gap-4 items-start">
      <Text>{t('misconfiguration-detected')}</Text>
      <Button onClick={() => signOut()}>{t('sign-out')}</Button>
    </div>
  );
};
