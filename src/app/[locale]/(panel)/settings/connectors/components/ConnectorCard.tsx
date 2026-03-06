'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2Icon } from 'lucide-react';
import { Button } from '@ragenai/tui/button';
import { Badge } from '@ragenai/tui/badge';
import { Switch, SwitchField } from '@ragenai/tui/switch';
import type { McpConnectorProvider } from '@/generated/prisma/client';
import type {
  ConnectorDto,
  ProviderDefinition,
} from '@/features/connectors/contracts/connector.types';
import {
  initiateConnection,
  confirmConnection,
  disconnectProvider,
  toggleProvider,
} from '../actions';

const providerIcons: Record<McpConnectorProvider, string> = {
  GOOGLE_CALENDAR: '/assets/connectors/google-calendar.svg',
  GOOGLE_ANALYTICS: '/assets/connectors/google-analytics.svg',
  GOOGLE_ADS: '/assets/connectors/google-ads.svg',
};

type ConnectorCardProps = {
  provider: ProviderDefinition;
  connector: ConnectorDto | undefined;
};

export function ConnectorCard({ provider, connector }: ConnectorCardProps) {
  const t = useTranslations('settings-page.connectors');
  const [loading, setLoading] = useState(false);
  const [currentConnector, setCurrentConnector] = useState(connector);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isConnected = currentConnector?.status === 'CONNECTED';
  const isPending = currentConnector?.status === 'PENDING';

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const handleConnect = async () => {
    setLoading(true);
    try {
      const result = await initiateConnection(provider.provider);

      const mcpServerBaseUrl = provider.mcpServerUrl;
      const callbackUrl = `${window.location.origin}${window.location.pathname}`;
      const authUrl = `${mcpServerBaseUrl}/auth/google?customer_id=${encodeURIComponent(result.customer_id)}&redirect_uri=${encodeURIComponent(callbackUrl)}`;

      const popup = window.open(authUrl, 'google-auth', 'width=600,height=700');

      if (!popup || popup.closed) {
        setLoading(false);
        return;
      }

      intervalRef.current = setInterval(() => {
        // Try to read popup URL to detect success redirect
        let popupSuccess = false;
        try {
          if (popup.location?.search) {
            const params = new URLSearchParams(popup.location.search);
            popupSuccess = params.get('status') === 'success';
          }
        } catch {
          // Cross-origin — can't read popup URL while on Google's domain
        }

        if (popupSuccess || popup.closed) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          if (!popup.closed) {
            popup.close();
          }
          if (popupSuccess) {
            handleAuthCallback(result.id);
          } else {
            setLoading(false);
          }
        }
      }, 500);
    } catch {
      setLoading(false);
    }
  };

  const handleAuthCallback = async (connectorId: string) => {
    try {
      const updated = await confirmConnection(connectorId);
      setCurrentConnector({
        ...currentConnector,
        id: connectorId,
        provider: provider.provider,
        mcp_server_url: provider.mcpServerUrl,
        customer_id: '',
        status: updated.status,
        connected_at: updated.connected_at,
        enabled: true,
        created_at: new Date(),
      });
    } catch {
      // Auth may have failed or user closed popup before completing
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!currentConnector) {
      return;
    }
    setLoading(true);
    try {
      await disconnectProvider(currentConnector.id);
      setCurrentConnector(undefined);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (enabled: boolean) => {
    if (!currentConnector) {
      return;
    }
    try {
      await toggleProvider(currentConnector.id, enabled);
      setCurrentConnector({ ...currentConnector, enabled });
    } catch {
      // Revert on error
    }
  };

  return (
    <div className="flex items-start gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg">
        <img
          src={providerIcons[provider.provider]}
          alt={provider.name}
          className="size-6"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-zinc-950 dark:text-white">
            {provider.name}
          </h3>
          {isConnected && <Badge color="green">{t('connected')}</Badge>}
          {isPending && <Badge color="amber">{t('pending')}</Badge>}
        </div>
        <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
          {provider.description}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {isConnected && (
          <SwitchField>
            <Switch
              checked={currentConnector?.enabled ?? false}
              onChange={handleToggle}
            />
          </SwitchField>
        )}
        {isConnected ? (
          <Button plain onClick={handleDisconnect} disabled={loading}>
            {loading ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              t('disconnect')
            )}
          </Button>
        ) : (
          <Button outline onClick={handleConnect} disabled={loading}>
            {loading ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              t('connect')
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
