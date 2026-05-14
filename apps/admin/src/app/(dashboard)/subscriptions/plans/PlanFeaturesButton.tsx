'use client';

import { useState } from 'react';
import { PlanFeaturesDialog } from './PlanFeaturesDialog';

export function PlanFeaturesButton({
  planId,
  planName,
  features,
}: {
  planId: string;
  planName: string;
  features: Record<string, boolean>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
      >
        Edit features
      </button>
      {open && (
        <PlanFeaturesDialog
          planId={planId}
          planName={planName}
          initial={features}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
