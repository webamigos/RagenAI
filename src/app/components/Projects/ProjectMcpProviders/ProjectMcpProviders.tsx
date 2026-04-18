'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Checkbox } from '@ragenai/tui';
import { PROVIDER_ICON_PATHS } from '@/features/connectors/utils/provider-icons';
import type { McpConnectorProvider } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';
import {
  getConnectedProvidersAction,
  getProjectMcpProvidersAction,
  saveProjectMcpProvidersAction,
  type ConnectedProvider,
} from './actions';

type ProjectMcpProvidersProps = {
  projectId: string;
};

export function ProjectMcpProviders({ projectId }: ProjectMcpProvidersProps) {
  const t = useTranslations('projects.project-view');
  const tProviders = useTranslations('settings-page.connectors.providers');
  const [connectedProviders, setConnectedProviders] = useState<
    ConnectedProvider[]
  >([]);
  const [enabledProviders, setEnabledProviders] = useState<Set<string>>(
    new Set(),
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getConnectedProvidersAction(),
      getProjectMcpProvidersAction(projectId),
    ])
      .then(([connected, enabled]) => {
        if (cancelled) {
          return;
        }
        setConnectedProviders(connected);
        setEnabledProviders(new Set(enabled));
        setLoaded(true);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        logger.error('Failed to load MCP providers:', { error });
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const handleToggle = useCallback(
    async (provider: string, checked: boolean) => {
      setEnabledProviders((prev) => {
        const next = new Set(prev);
        if (checked) {
          next.add(provider);
        } else {
          next.delete(provider);
        }

        saveProjectMcpProvidersAction(projectId, Array.from(next)).then(
          (result) => {
            if (!result.success) {
              setEnabledProviders(prev);
            }
          },
        );

        return next;
      });
    },
    [projectId],
  );

  if (!loaded) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
      <h3 className="text-sm font-semibold mb-3">{t('connectors')}</h3>
      {connectedProviders.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t('connectors-description')}
        </p>
      ) : (
        <div className="space-y-2">
          {connectedProviders.map(({ provider }) => {
            const iconPath =
              PROVIDER_ICON_PATHS[provider as McpConnectorProvider];
            return (
              <label
                key={provider}
                className="flex items-center gap-2.5 cursor-pointer"
              >
                <Checkbox
                  checked={enabledProviders.has(provider)}
                  onChange={(checked) => handleToggle(provider, checked)}
                />
                {iconPath ? (
                  <img src={iconPath} alt="" className="size-4 shrink-0" />
                ) : null}
                <span className="text-sm text-foreground truncate">
                  {tProviders(`${provider}.name`)}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
