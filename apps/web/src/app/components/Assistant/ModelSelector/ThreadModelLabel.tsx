'use client';

import { useEffect, useState } from 'react';

import { publicRuntimeConfig } from '@/config/public-runtime-config';
import { getAvailableModelsForOrganization } from '@/app/lib/actions/checkAvailableProviders';
import { useOrganization } from '@/app/hooks/use-auth';
import {
  type AvailableModel,
  availableModels,
  normalizeModelId,
  isReasoningModel,
} from '../../config';
import { BrainIcon } from '@/libs/common-ui/icons/BrainIcon';

type Props = {
  model: string | null;
};

/**
 * One request per organization for the life of the page, however many
 * threads render a label. The list is the one the picker shows.
 */
const servedByOrganization = new Map<string, Promise<AvailableModel[]>>();

function servedModels(organizationId: string): Promise<AvailableModel[]> {
  let served = servedByOrganization.get(organizationId);
  if (!served) {
    served = getAvailableModelsForOrganization(organizationId).catch(() => {
      // Forget a failure so the next label asks again; this one falls back to
      // the static catalogue.
      servedByOrganization.delete(organizationId);
      return [];
    });
    servedByOrganization.set(organizationId, served);
  }
  return served;
}

/** For tests. */
export function resetServedModelsCache(): void {
  servedByOrganization.clear();
}

/**
 * The model a thread answers with, named the way the picker names it.
 *
 * The static catalogue alone is not enough. A model on the install's own
 * hardware is described by its route (`display` in the route table), so the
 * catalogue either does not know it — and the label showed the raw route id,
 * `local-chat` — or knows the id under a cloud name the install has aliased to
 * a local model. The served list from the server is what the picker uses; the
 * catalogue is only the label until it arrives.
 */
export const ThreadModelLabel = ({ model }: Props) => {
  const { organization } = useOrganization();
  // Kept with the organization it was fetched for, so a label rendered right
  // after switching organizations does not show the previous one's names.
  const [served, setServed] = useState<{
    organizationId: string;
    models: AvailableModel[];
  } | null>(null);

  useEffect(() => {
    if (!organization?.id) {
      return;
    }
    let live = true;
    const organizationId = organization.id;
    void servedModels(organizationId).then((models) => {
      if (live) {
        setServed({ organizationId, models });
      }
    });
    return () => {
      live = false;
    };
  }, [organization?.id]);

  if (publicRuntimeConfig().hideModelSelector === '1') {
    return null;
  }
  if (!model) {
    return null;
  }

  const normalized = normalizeModelId(model);
  const servedConfig =
    served && served.organizationId === organization?.id
      ? served.models.find((m) => m.value === normalized)
      : undefined;
  const catalogueConfig = availableModels.find((m) => m.value === normalized);
  const label = servedConfig?.label || catalogueConfig?.label || model;
  const reasoning = servedConfig
    ? servedConfig.reasoning === true
    : isReasoningModel(normalized);

  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground">
      {reasoning && <BrainIcon className="size-3" />}
      {label}
    </span>
  );
};
