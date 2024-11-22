import { useTranslations } from 'next-intl';

import { Card, Text, SidebarItem, CheckIcon, Link } from '@salesyy/common-ui';
import { useSettings } from '@/app/hooks/useSettings';

export const ValidationBoard = () => {
  const { hasApiKey, BelongsToOrganization, hasKnowledge } = useSettings();
  const t = useTranslations('setup-board');

  return (
    <Card title={t('title')}>
      {BelongsToOrganization ? (
        <SidebarItem>
          <CheckIcon className="text-green-600" />
          <Text className="mr-auto">{t('organization-setup')}</Text>
        </SidebarItem>
      ) : (
        <Link href="/my-profile/create-organization">
          <SidebarItem hasIcon>
            <CheckIcon className="text-gray-400" />
            <Text className="mr-auto">{t('no-organization')}</Text>
          </SidebarItem>
        </Link>
      )}
      {BelongsToOrganization && !hasApiKey ? (
        <Link href="/my-profile/prompt-management">
          <SidebarItem hasIcon={!hasApiKey}>
            <CheckIcon
              className={hasApiKey ? 'text-green-600' : 'text-gray-400'}
            />
            <Text className="mr-auto">
              {hasApiKey ? t('api-key-configured') : t('no-api-key')}
            </Text>
          </SidebarItem>
        </Link>
      ) : (
        <SidebarItem disabled={!BelongsToOrganization}>
          <CheckIcon
            className={hasApiKey ? 'text-green-600' : 'text-gray-400'}
          />
          <Text className="mr-auto">{t('no-api-key')}</Text>
        </SidebarItem>
      )}
      {hasApiKey && !hasKnowledge ? (
        <Link href="/manage-knowledge">
          <SidebarItem hasIcon={!hasKnowledge}>
            <CheckIcon
              className={hasKnowledge ? 'text-green-600' : 'text-gray-400'}
            />
            <Text className="mr-auto">
              {hasKnowledge ? t('knowledge-uploaded') : t('no-knowledge')}
            </Text>
          </SidebarItem>
        </Link>
      ) : (
        <SidebarItem disabled hasIcon>
          <CheckIcon
            className={hasKnowledge ? 'text-green-600' : 'text-gray-400'}
          />
          <Text>{t('no-knowledge')}</Text>
        </SidebarItem>
      )}
    </Card>
  );
};
