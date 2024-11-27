import { useTranslations } from 'next-intl';

import {
  Card,
  Text,
  SidebarItem,
  CheckIcon,
  Link,
  Button,
} from '@ragenai/common-ui';
import { useSettings } from '@/app/hooks/useSettings';

export const ValidationBoard = () => {
  const { hasApiKey, belongsToOrganization, hasKnowledge } = useSettings();
  const t = useTranslations('setup-board');

  return (
    <Card title={t('title')}>
      {belongsToOrganization ? (
        <Button className="w-full" isLink>
          <CheckIcon className="text-green-600" />
          <Text className="ml-3">{t('organization-setup')}</Text>
        </Button>
      ) : (
        <SidebarItem href="/my-profile/create-organization" hasIcon>
          <CheckIcon className="text-gray-400" />
          <Text className="mr-auto">{t('no-organization')}</Text>
        </SidebarItem>
      )}
      {belongsToOrganization && !hasApiKey ? (
        <SidebarItem href="/my-profile/prompt-management" hasIcon={!hasApiKey}>
          <CheckIcon
            className={hasApiKey ? 'text-green-600' : 'text-gray-400'}
          />
          <Text className="mr-auto">
            {hasApiKey ? t('api-key-configured') : t('no-api-key')}
          </Text>
        </SidebarItem>
      ) : (
        <Button className="w-full" isLink disabled={!belongsToOrganization}>
          <CheckIcon
            className={hasApiKey ? 'text-green-600' : 'text-gray-400'}
          />
          <Text className="ml-3">{t('no-api-key')}</Text>
        </Button>
      )}
      {hasApiKey && !hasKnowledge ? (
        <SidebarItem href="/manage-knowledge" hasIcon={!hasKnowledge}>
          <CheckIcon
            className={hasKnowledge ? 'text-green-600' : 'text-gray-400'}
          />
          <Text className="mr-auto">
            {hasKnowledge ? t('knowledge-uploaded') : t('no-knowledge')}
          </Text>
        </SidebarItem>
      ) : (
        <Button className="w-full" disabled>
          <CheckIcon
            className={hasKnowledge ? 'text-green-600' : 'text-gray-400'}
          />
          <Text className="ml-3">{t('no-knowledge')}</Text>
        </Button>
      )}
    </Card>
  );
};
