'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { Loader2Icon } from 'lucide-react';
import { Button } from '@ragenai/tui/button';
import { Badge } from '@ragenai/tui/badge';
import { Switch, SwitchField } from '@ragenai/tui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
  registerApiKey,
} from '../actions';

const providerIcons: Record<McpConnectorProvider, string> = {
  GOOGLE_CALENDAR: '/assets/connectors/google-calendar.svg',
  GOOGLE_ANALYTICS: '/assets/connectors/google-analytics.svg',
  GOOGLE_ADS: '/assets/connectors/google-ads.svg',
  GOOGLE_DRIVE: '/assets/connectors/google-drive.svg',
  GMAIL: '/assets/connectors/gmail.svg',
  CLICKUP: '/assets/connectors/clickup.svg',
  HUBSPOT: '/assets/connectors/hubspot.svg',
  FIREFLIES: '/assets/connectors/fireflies.svg',
  SLACK: '/assets/connectors/slack.svg',
};

type ConnectorCardProps = {
  provider: ProviderDefinition;
  connector: ConnectorDto | undefined;
};

export function ConnectorCard({ provider, connector }: ConnectorCardProps) {
  const t = useTranslations('settings-page.connectors');
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [currentConnector, setCurrentConnector] = useState(connector);
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isConnected = currentConnector?.status === 'CONNECTED';
  const isPending = currentConnector?.status === 'PENDING';
  const isApiKeyAuth =
    provider.authType === 'api_key' || provider.authType === 'api_key_bearer';
  const isExternalMcp = provider.authType === 'external_mcp';

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const handleApiKeySubmit = async () => {
    if (!apiKeyValue.trim()) {
      return;
    }
    setLoading(true);
    setApiKeyError(null);
    try {
      const updated = await registerApiKey(provider.provider, apiKeyValue);
      setCurrentConnector({
        ...currentConnector,
        id: updated.id,
        provider: provider.provider,
        mcpServerUrl: provider.mcpServerUrl,
        customerId: '',
        status: updated.status,
        connectedAt: updated.connectedAt,
        enabled: true,
        createdAt: new Date(),
      });
      setApiKeyDialogOpen(false);
      setApiKeyValue('');
      router.refresh();
    } catch {
      setApiKeyError(t('api-key-error'));
    } finally {
      setLoading(false);
    }
  };

  const handleExternalMcpConnect = async () => {
    setLoading(true);
    try {
      // First create the connector record in PENDING state
      const result = await initiateConnection(provider.provider);

      const callbackUrl = `${window.location.origin}/api/connectors/external/callback?provider=${provider.provider}`;
      const params = new URLSearchParams({
        provider: provider.provider,
        callback_url: callbackUrl,
      });
      const response = await fetch(
        `/api/connectors/external/connect?${params.toString()}`,
      );
      if (!response.ok) {
        setLoading(false);
        return;
      }
      const data = await response.json();

      if (data.status === 'already_authorized') {
        handleAuthCallback(result.id);
        return;
      }

      if (!data.authorization_url) {
        setLoading(false);
        return;
      }

      const popup = window.open(
        data.authorization_url,
        'oauth-popup',
        'width=600,height=700',
      );

      if (!popup || popup.closed) {
        setLoading(false);
        return;
      }

      intervalRef.current = setInterval(() => {
        let popupSuccess = false;
        try {
          if (popup.location?.search) {
            const popupParams = new URLSearchParams(popup.location.search);
            popupSuccess = popupParams.get('status') === 'success';
          }
        } catch {
          // Cross-origin — can't read popup URL while on external OAuth domain
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

  const handleConnect = async () => {
    if (isApiKeyAuth) {
      setApiKeyDialogOpen(true);
      setApiKeyValue('');
      setApiKeyError(null);
      return;
    }

    if (isExternalMcp) {
      return handleExternalMcpConnect();
    }

    setLoading(true);
    try {
      const result = await initiateConnection(provider.provider);

      const mcpServerBaseUrl = provider.authBaseUrl || provider.mcpServerUrl;
      const callbackUrl = `${window.location.origin}${window.location.pathname}`;
      const authParams = new URLSearchParams({
        customer_id: result.customerId,
        redirect_uri: callbackUrl,
      });
      if (provider.scopes?.length) {
        authParams.set('scopes', provider.scopes.join(' '));
      }
      const authUrl = `${mcpServerBaseUrl}${provider.authPath}?${authParams.toString()}`;

      const popup = window.open(authUrl, 'oauth-popup', 'width=600,height=700');

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
        mcpServerUrl: provider.mcpServerUrl,
        customerId: '',
        status: updated.status,
        connectedAt: updated.connectedAt,
        enabled: true,
        createdAt: new Date(),
      });
      router.refresh();
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
      router.refresh();
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
            {t(`providers.${provider.provider}.name`)}
          </h3>
          {isConnected && <Badge color="green">{t('connected')}</Badge>}
          {isPending && <Badge color="amber">{t('pending')}</Badge>}
        </div>
        <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
          {t(`providers.${provider.provider}.description`)}
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

      {isApiKeyAuth && (
        <Dialog
          open={apiKeyDialogOpen}
          onOpenChange={(open) => {
            setApiKeyDialogOpen(open);
            if (!open) {
              setApiKeyValue('');
              setApiKeyError(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {t('api-key-title', {
                  provider: t(`providers.${provider.provider}.name`),
                })}
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                {t('api-key-description', {
                  provider: t(`providers.${provider.provider}.name`),
                })}
                {provider.apiKeyHelpUrl && (
                  <>
                    {' '}
                    <a
                      href={provider.apiKeyHelpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline hover:text-primary/80"
                    >
                      {t('api-key-help-link')}
                    </a>
                  </>
                )}
              </p>
              <Input
                type="password"
                value={apiKeyValue}
                onChange={(e) => setApiKeyValue(e.target.value)}
                placeholder={t('api-key-placeholder')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleApiKeySubmit();
                  }
                }}
                autoFocus
              />
              {apiKeyError && (
                <p className="text-sm text-red-500">{apiKeyError}</p>
              )}
              <Button
                onClick={handleApiKeySubmit}
                disabled={loading || !apiKeyValue.trim()}
                className="self-end"
              >
                {loading ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  t('connect')
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
