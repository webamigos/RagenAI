'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { Loader2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type {
  ConnectorDto,
  PublicProviderDto,
} from '@/features/connectors/contracts/connector.types';
import { PROVIDER_ICON_PATHS as providerIcons } from '@/features/connectors/utils/provider-icons';
import { useOrgFeature } from '@/app/hooks/useOrgFeatures';
import {
  initiateConnection,
  confirmConnection,
  disconnectProvider,
  toggleProvider,
  registerApiKey,
  registerCustomHeaderConnection,
  testCustomHeaderConnection,
} from '../actions';

type ConnectorCardProps = {
  provider: PublicProviderDto;
  connector: ConnectorDto | undefined;
};

export function ConnectorCard({ provider, connector }: ConnectorCardProps) {
  const t = useTranslations('settings-page.connectors');
  const router = useRouter();
  /**
   * `mcpConnectors` is resolved per organization and is off for the demo
   * tenant. Both `create-connector-command` and apps/api's ConnectorsService
   * already refuse the write, so before this the demo visitor saw a live
   * "Connect" button that opened an OAuth popup and then failed. The button
   * stays visible — the page is a showcase of what can be wired — but
   * disabled, and says why.
   */
  const connectorsEnabled = useOrgFeature('mcpConnectors');
  const [loading, setLoading] = useState(false);
  const [currentConnector, setCurrentConnector] = useState(connector);
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isConnected = currentConnector?.status === 'CONNECTED';
  const isPending = currentConnector?.status === 'PENDING';
  /**
   * `McpConnectorStatus.ERROR` had no branch here at all, so a connector that
   * had stopped working rendered as neither connected nor pending — which
   * looks exactly like one that was never set up. The user was offered
   * "Connect" for something they had already connected, with no hint that
   * their assistant had quietly lost those tools.
   */
  const isFailing = currentConnector?.status === 'ERROR';
  const isApiKeyAuth =
    provider.authType === 'api_key' || provider.authType === 'api_key_bearer';
  const isExternalMcp = provider.authType === 'external_mcp';
  const isCustomHeaderAuth = provider.authType === 'api_key_custom_header';
  const isServerSide = provider.authType === 'server_side';

  const [customHeaderDialogOpen, setCustomHeaderDialogOpen] = useState(false);
  const [siteUrl, setSiteUrl] = useState('');
  const [consumerKey, setConsumerKey] = useState('');
  const [consumerSecret, setConsumerSecret] = useState('');
  const [customHeaderError, setCustomHeaderError] = useState<string | null>(
    null,
  );
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: true; toolCount: number } | { ok: false; error: string } | null
  >(null);

  const resetCustomHeaderDialog = () => {
    setSiteUrl('');
    setConsumerKey('');
    setConsumerSecret('');
    setCustomHeaderError(null);
    setTestResult(null);
  };

  // Open Mercato-style providers take a single opaque key; WooCommerce-style
  // providers need both fields. Kept as one derived flag rather than
  // sprinkling `provider.singleTokenAuth` checks through every handler below.
  const isSingleTokenAuth = Boolean(provider.singleTokenAuth);
  const customHeaderFieldsFilled = Boolean(
    siteUrl.trim() &&
    consumerKey.trim() &&
    (isSingleTokenAuth || consumerSecret.trim()),
  );

  const handleCustomHeaderTest = async () => {
    if (!customHeaderFieldsFilled) {
      return;
    }
    setTesting(true);
    setCustomHeaderError(null);
    try {
      const result = await testCustomHeaderConnection(provider.provider, {
        siteUrl,
        consumerKey,
        ...(isSingleTokenAuth ? {} : { consumerSecret }),
      });
      setTestResult(result);
    } catch {
      setTestResult({ ok: false, error: t('custom-header-test-error') });
    } finally {
      setTesting(false);
    }
  };

  const handleCustomHeaderSubmit = async () => {
    if (!customHeaderFieldsFilled) {
      return;
    }
    setLoading(true);
    setCustomHeaderError(null);
    try {
      const updated = await registerCustomHeaderConnection(provider.provider, {
        siteUrl,
        consumerKey,
        ...(isSingleTokenAuth ? {} : { consumerSecret }),
      });
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
        // Optimistic update after a *successful* connect, so there is no
        // fault to carry over — and spreading `currentConnector` alone would
        // leave these `undefined` rather than `null`.
        lastError: null,
        lastErrorAt: null,
      });
      setCustomHeaderDialogOpen(false);
      resetCustomHeaderDialog();
      router.refresh();
    } catch (err) {
      setCustomHeaderError(
        err instanceof Error ? err.message : t('custom-header-error'),
      );
    } finally {
      setLoading(false);
    }
  };

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
        // Optimistic update after a *successful* connect, so there is no
        // fault to carry over — and spreading `currentConnector` alone would
        // leave these `undefined` rather than `null`.
        lastError: null,
        lastErrorAt: null,
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

    if (isCustomHeaderAuth) {
      resetCustomHeaderDialog();
      setCustomHeaderDialogOpen(true);
      return;
    }

    if (isExternalMcp) {
      return handleExternalMcpConnect();
    }

    if (isServerSide) {
      // No OAuth, no credentials dialog — the MCP service holds the
      // upstream credential. Just create the connector row and flip
      // it straight to CONNECTED via the same confirm endpoint the
      // popup flow uses.
      setLoading(true);
      try {
        const result = await initiateConnection(provider.provider);
        await handleAuthCallback(result.id);
      } catch {
        setLoading(false);
      }
      return;
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
        // Optimistic update after a *successful* connect, so there is no
        // fault to carry over — and spreading `currentConnector` alone would
        // leave these `undefined` rather than `null`.
        lastError: null,
        lastErrorAt: null,
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
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4 sm:flex-row sm:items-center">
      <div className="flex items-center gap-3 sm:contents">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg">
          <img
            src={providerIcons[provider.provider]}
            alt={provider.name}
            className="size-6"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">
              {t(`providers.${provider.provider}.name`)}
            </h3>
            {isConnected && <Badge variant="ready">{t('connected')}</Badge>}
            {isPending && <Badge variant="pending">{t('pending')}</Badge>}
            {isFailing && <Badge variant="destructive">{t('failing')}</Badge>}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t(`providers.${provider.provider}.description`)}
          </p>
          {isFailing && (
            <div className="mt-1.5 text-sm text-destructive">
              <p>
                {t('failing-reason', {
                  when: currentConnector?.lastErrorAt
                    ? new Date(currentConnector.lastErrorAt).toLocaleString()
                    : '—',
                  // The stored reason comes from the MCP server or the OAuth
                  // exchange, so it is rendered as text and never as markup.
                  reason: currentConnector?.lastError ?? '—',
                })}
              </p>
              <p className="text-muted-foreground">{t('failing-hint')}</p>
            </div>
          )}
        </div>
      </div>
      <div className="flex w-full shrink-0 items-center gap-3 sm:w-auto">
        {isConnected && (
          <Switch
            checked={currentConnector?.enabled ?? false}
            onCheckedChange={handleToggle}
          />
        )}
        {isConnected ? (
          <Button
            variant="ghost"
            onClick={handleDisconnect}
            disabled={loading}
            className="sm:w-auto w-full"
          >
            {loading ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              t('disconnect')
            )}
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={handleConnect}
            disabled={loading || !connectorsEnabled}
            title={connectorsEnabled ? undefined : t('disabled-for-org')}
            className="sm:w-auto w-full"
          >
            {loading ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              t(isFailing ? 'reconnect' : 'connect')
            )}
          </Button>
        )}
      </div>

      {isCustomHeaderAuth && (
        <Dialog
          open={customHeaderDialogOpen}
          onOpenChange={(open) => {
            setCustomHeaderDialogOpen(open);
            if (!open) {
              resetCustomHeaderDialog();
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {t('custom-header-title', {
                  provider: t(`providers.${provider.provider}.name`),
                })}
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                {t(
                  isSingleTokenAuth
                    ? 'custom-header-instance-description'
                    : 'custom-header-description',
                  { provider: t(`providers.${provider.provider}.name`) },
                )}
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
              <label className="flex flex-col gap-1 text-sm">
                <span>
                  {t(
                    isSingleTokenAuth
                      ? 'custom-header-instance-url-label'
                      : 'custom-header-site-url-label',
                  )}
                </span>
                <Input
                  type="url"
                  value={siteUrl}
                  onChange={(e) => setSiteUrl(e.target.value)}
                  placeholder={
                    isSingleTokenAuth
                      ? 'https://your-org.example.com'
                      : 'https://yourstore.com'
                  }
                  autoFocus
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>
                  {t(
                    isSingleTokenAuth
                      ? 'custom-header-api-key-label'
                      : 'custom-header-consumer-key-label',
                  )}
                </span>
                <Input
                  type={isSingleTokenAuth ? 'password' : 'text'}
                  value={consumerKey}
                  onChange={(e) => setConsumerKey(e.target.value)}
                  placeholder={isSingleTokenAuth ? 'omk_...' : 'ck_...'}
                />
              </label>
              {!isSingleTokenAuth && (
                <label className="flex flex-col gap-1 text-sm">
                  <span>{t('custom-header-consumer-secret-label')}</span>
                  <Input
                    type="password"
                    value={consumerSecret}
                    onChange={(e) => setConsumerSecret(e.target.value)}
                    placeholder="cs_..."
                  />
                </label>
              )}
              {testResult?.ok && (
                <p className="text-sm text-ready">
                  {t('custom-header-test-success', {
                    count: testResult.toolCount,
                  })}
                </p>
              )}
              {testResult && !testResult.ok && (
                <p className="text-sm text-destructive">{testResult.error}</p>
              )}
              {customHeaderError && (
                <p className="text-sm text-destructive">{customHeaderError}</p>
              )}
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={handleCustomHeaderTest}
                  disabled={testing || !customHeaderFieldsFilled}
                >
                  {testing ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    t('custom-header-test')
                  )}
                </Button>
                <Button
                  onClick={handleCustomHeaderSubmit}
                  disabled={loading || !customHeaderFieldsFilled}
                >
                  {loading ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    t('connect')
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

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
                <p className="text-sm text-destructive">{apiKeyError}</p>
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
