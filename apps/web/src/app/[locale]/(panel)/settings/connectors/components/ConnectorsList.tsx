'use client';
import { connectorSlug } from '@ragenai/platform-contracts';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type {
  ConnectorDto,
  PublicProviderDto,
} from '@/features/connectors/contracts/connector.types';
import { ConnectorCard } from './ConnectorCard';
import { useOrgFeature } from '@/app/hooks/useOrgFeatures';

type ConnectorsListProps = {
  providers: readonly PublicProviderDto[];
  connectors: ConnectorDto[];
};

const COMING_SOON_PROVIDERS = [
  {
    key: 'BASELINKER',
    name: 'BaseLinker',
    descriptionKey: 'baselinker-description' as const,
    icon: '/assets/connectors/baselinker.svg',
  },
  {
    key: 'KSEF',
    name: 'KSeF',
    descriptionKey: 'ksef-description' as const,
    icon: '/assets/connectors/ksef.svg',
  },
  {
    key: 'NOTION',
    name: 'Notion',
    descriptionKey: 'notion-description' as const,
    icon: '/assets/connectors/notion.svg',
  },
];

/**
 * The teaser cards are static, and the catalogue is not: a platform
 * administrator can now add Notion as a row, which is the whole point of the
 * catalogue. The card above it would then say the connector is coming while
 * the card below it offers to connect, so a slug the catalogue carries drops
 * out of this list. Compared case-insensitively, because a teaser key is an
 * old enum member and an operator's slug is whatever they typed.
 */
export function comingSoon(
  providers: readonly PublicProviderDto[],
): typeof COMING_SOON_PROVIDERS {
  const live = new Set(providers.map((p) => p.provider.toLowerCase()));

  return COMING_SOON_PROVIDERS.filter(
    (teaser) => !live.has(teaser.key.toLowerCase()),
  );
}

export function ConnectorsList({ providers, connectors }: ConnectorsListProps) {
  const t = useTranslations('settings-page.connectors');
  const connectorsEnabled = useOrgFeature('mcpConnectors');

  return (
    <div className="space-y-3">
      {!connectorsEnabled && (
        <div className="rounded-lg border border-pending/40 bg-pending-tint p-3 dark:bg-pending/30">
          <p className="text-sm text-pending">{t('disabled-for-org')}</p>
        </div>
      )}
      {providers.map((provider) => {
        const connector = connectors.find(
          (c) => connectorSlug(c) === provider.provider,
        );
        return (
          <ConnectorCard
            key={provider.provider}
            provider={provider}
            connector={connector}
          />
        );
      })}
      {comingSoon(providers).map((provider) => (
        <div
          key={provider.key}
          className="flex items-start gap-4 rounded-lg border border-border p-4"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg">
            <img src={provider.icon} alt={provider.name} className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-foreground">
                {provider.name}
              </h3>
              <Badge variant="secondary">{t('coming-soon')}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t(provider.descriptionKey)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
