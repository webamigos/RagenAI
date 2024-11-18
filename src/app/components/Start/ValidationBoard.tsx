import { useTranslations } from 'next-intl';

import { Card, Text, SidebarItem, CheckIcon, Link } from '@salesyy/common-ui';
import { useSettings } from '@/app/hooks/useSettings';

export const ValidationBoard = () => {
  const { hasApiKey, BelongsToOrganization, hasKnowledge } = useSettings();
  const t = useTranslations('setup-board');

  return (
    <Card title={t('title')}>
      <Link href="/my-profile/create-organization">
        <SidebarItem hasIcon>
          <CheckIcon
            className={
              BelongsToOrganization ? 'text-green-600' : 'text-gray-400'
            }
          />
          <Text className="mr-auto">
            {BelongsToOrganization
              ? t('organization-setup')
              : t('no-organization')}
          </Text>
        </SidebarItem>
      </Link>
      <Link
        className="cursor-not-allowed"
        href={BelongsToOrganization ? '/my-profile/prompt-management' : ''}
      >
        <SidebarItem disabled={!BelongsToOrganization} hasIcon>
          <CheckIcon
            className={hasApiKey ? 'text-green-600' : 'text-gray-400'}
          />
          <Text className="mr-auto">
            {hasApiKey ? t('api-key-configured') : t('no-api-key')}
          </Text>
        </SidebarItem>
      </Link>
      <Link href={!hasApiKey ? '' : '/manage-knowledge'}>
        <SidebarItem disabled={!hasApiKey}>
          <CheckIcon
            className={hasKnowledge ? 'text-green-600' : 'text-gray-400'}
          />
          <Text>
            {hasKnowledge ? t('knowledge-uploaded') : t('no-knowledge')}
          </Text>
        </SidebarItem>
      </Link>
    </Card>
  );
};
