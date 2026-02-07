import { useTranslations } from 'next-intl';
import { signOut } from '@/app/hooks/use-better-auth';
import { Button } from '@ragenai/common-ui/Button';
import { Text } from '@ragenai/common-ui/Text';

export const Misconfigured = () => {
  const t = useTranslations('account-configuration');

  return (
    <div className="flex flex-col gap-4 items-start">
      <Text>{t('misconfiguration-detected')}</Text>
      <Button onClick={() => signOut()}>{t('sign-out')}</Button>
    </div>
  );
};
