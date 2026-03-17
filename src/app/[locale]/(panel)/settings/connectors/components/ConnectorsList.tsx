'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@ragenai/tui/badge';
import type { ConnectorDto } from '@/features/connectors/contracts/connector.types';
import type { ProviderDefinition } from '@/features/connectors/contracts/connector.types';
import { ConnectorCard } from './ConnectorCard';

type ConnectorsListProps = {
  providers: ProviderDefinition[];
  connectors: ConnectorDto[];
};

const COMING_SOON_PROVIDERS = [
  {
    key: 'NOTION',
    name: 'Notion',
    descriptionKey: 'notion-description' as const,
    icon: '/assets/connectors/notion.svg',
  },
];

export function ConnectorsList({ providers, connectors }: ConnectorsListProps) {
  const t = useTranslations('settings-page.connectors');

  return (
    <div className="space-y-3">
      {providers.map((provider) => {
        const connector = connectors.find(
          (c) => c.provider === provider.provider,
        );
        return (
          <ConnectorCard
            key={provider.provider}
            provider={provider}
            connector={connector}
          />
        );
      })}
      {COMING_SOON_PROVIDERS.map((provider) => (
        <div
          key={provider.key}
          className="flex items-start gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg">
            <img src={provider.icon} alt={provider.name} className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-zinc-950 dark:text-white">
                {provider.name}
              </h3>
              <Badge color="zinc">{t('coming-soon')}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
              {t(provider.descriptionKey)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
