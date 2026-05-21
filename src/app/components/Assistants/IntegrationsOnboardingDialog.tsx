'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@ragenai/tui';
import { PROVIDER_ICON_PATHS } from '@/features/connectors/utils/provider-icons';
import type { McpConnectorProvider } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';
import { statusToast } from '@/app/lib/utils/toast';
import {
  getConnectedProvidersAction,
  getProjectMcpProvidersAction,
  getIntegrationsPromptStatusAction,
  markIntegrationsPromptedAction,
  saveProjectMcpProvidersAction,
  type ConnectedProvider,
} from '@/app/components/Projects/ProjectMcpProviders/actions';

type Props = {
  projectId: string;
};

export function IntegrationsOnboardingDialog({ projectId }: Props) {
  const t = useTranslations('integrations-onboarding');
  const tProviders = useTranslations('settings-page.connectors.providers');
  const { errorToast } = statusToast();

  const [isOpen, setIsOpen] = useState(false);
  const [connected, setConnected] = useState<ConnectedProvider[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const status = await getIntegrationsPromptStatusAction(projectId);
        if (cancelled || status.promptedAt) {
          return;
        }
        const [connectedProviders, enabled] = await Promise.all([
          getConnectedProvidersAction(),
          getProjectMcpProvidersAction(projectId),
        ]);
        if (cancelled) {
          return;
        }
        if (connectedProviders.length === 0) {
          // Nothing to prompt for — mark as done so we don't re-check next visit
          await markIntegrationsPromptedAction(projectId);
          return;
        }
        setConnected(connectedProviders);
        setSelected(new Set(enabled));
        setIsOpen(true);
      } catch (error) {
        logger.error(
          { err: error },
          'Failed to evaluate integrations onboarding',
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const toggle = (provider: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) {
        next.delete(provider);
      } else {
        next.add(provider);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const saveResult = await saveProjectMcpProvidersAction(
        projectId,
        Array.from(selected),
      );
      if (!saveResult.success) {
        errorToast({ message: t('save-error') });
        return;
      }
      const markResult = await markIntegrationsPromptedAction(projectId);
      if (!markResult.success) {
        errorToast({ message: t('save-error') });
        return;
      }
      setIsOpen(false);
    } catch (error) {
      logger.error({ err: error }, 'Failed to save integrations selection');
      errorToast({ message: t('save-error') });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = async () => {
    setIsSaving(true);
    try {
      const result = await markIntegrationsPromptedAction(projectId);
      if (!result.success) {
        errorToast({ message: t('save-error') });
        return;
      }
      setIsOpen(false);
    } catch (error) {
      logger.error({ err: error }, 'Failed to mark integrations prompted');
      errorToast({ message: t('save-error') });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next && !isSaving) {
          handleSkip();
        }
      }}
    >
      <DialogContent className="sm:max-w-md top-[20%] translate-y-0 sm:top-[20%]">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-amber-300/60 bg-amber-50 dark:border-amber-700/60 dark:bg-amber-950/30 p-3 flex gap-2 text-xs text-amber-800 dark:text-amber-200">
          <ExclamationTriangleIcon className="size-4 shrink-0 mt-0.5" />
          <p>{t('warning')}</p>
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto">
          {connected.map(({ provider }) => {
            const iconPath =
              PROVIDER_ICON_PATHS[provider as McpConnectorProvider];
            return (
              <label
                key={provider}
                className="flex items-center gap-2.5 cursor-pointer py-1"
              >
                <Checkbox
                  checked={selected.has(provider)}
                  onChange={() => toggle(provider)}
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

        <DialogFooter>
          <Button variant="ghost" onClick={handleSkip} disabled={isSaving}>
            {t('skip')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
