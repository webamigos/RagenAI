'use client';

import type { ConnectorDto } from '@/features/connectors/contracts/connector.types';
import type { ProviderDefinition } from '@/features/connectors/contracts/connector.types';
import { ConnectorCard } from './ConnectorCard';

type ConnectorsListProps = {
  providers: ProviderDefinition[];
  connectors: ConnectorDto[];
};

export function ConnectorsList({ providers, connectors }: ConnectorsListProps) {
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
    </div>
  );
}
