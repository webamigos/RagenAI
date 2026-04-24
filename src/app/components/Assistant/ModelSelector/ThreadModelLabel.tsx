'use client';

import {
  availableModels,
  normalizeModelId,
  isReasoningModel,
} from '../../config';
import { BrainIcon } from '@/libs/common-ui/icons/BrainIcon';

type Props = {
  model: string | null;
};

export const ThreadModelLabel = ({ model }: Props) => {
  if (process.env.NEXT_PUBLIC_HIDE_MODEL_SELECTOR === '1') {
    return null;
  }
  if (!model) {
    return null;
  }

  const normalized = normalizeModelId(model);
  const modelConfig = availableModels.find((m) => m.value === normalized);
  const label = modelConfig?.label || model;

  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground">
      {isReasoningModel(normalized) && <BrainIcon className="size-3" />}
      {label}
    </span>
  );
};
