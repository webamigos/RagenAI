'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { PuzzlePieceIcon } from '@heroicons/react/24/outline';
import { Checkbox } from '@/components/ui/checkbox';
import { PROVIDER_ICON_PATHS } from '@/features/connectors/utils/provider-icons';
import { PROJECT_MCP_PROVIDERS_CHANGED_EVENT } from '@/features/projects/contracts/events';
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
  const [reloadKey, setReloadKey] = useState(0);

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
  }, [projectId, reloadKey]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId: string }>).detail;
      if (detail?.projectId === projectId) {
        setReloadKey((k) => k + 1);
      }
    };
    window.addEventListener(PROJECT_MCP_PROVIDERS_CHANGED_EVENT, handler);
    return () => {
      window.removeEventListener(PROJECT_MCP_PROVIDERS_CHANGED_EVENT, handler);
    };
  }, [projectId]);

  const handleToggle = useCallback(
    async (provider: string, checked: boolean) => {
      const prev = new Set(enabledProviders);
      const next = new Set(prev);
      if (checked) {
        next.add(provider);
      } else {
        next.delete(provider);
      }

      setEnabledProviders(next);

      try {
        const result = await saveProjectMcpProvidersAction(
          projectId,
          Array.from(next),
        );
        if (!result.success) {
          setEnabledProviders(prev);
        }
      } catch {
        setEnabledProviders(prev);
      }
    },
    [projectId, enabledProviders],
  );

  if (!loaded) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold mb-3">
          <PuzzlePieceIcon className="size-4 text-muted-foreground" />
          {t('connectors')}
        </h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="size-3 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
          {t('loading')}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold mb-3">
        <PuzzlePieceIcon className="size-4 text-muted-foreground" />
        {t('connectors')}
      </h3>
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
                  onCheckedChange={(checked) =>
                    handleToggle(provider, checked === true)
                  }
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
