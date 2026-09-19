'use client';

import { useState } from 'react';

import type { GuardrailRow } from '../actions';
import { GuardrailForm } from './GuardrailForm';
import { GuardrailsList } from './GuardrailsList';

export function GuardrailsPage({ rules }: { rules: GuardrailRow[] }) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Guardrails</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Rules every organization is subject to. A new rule starts switched
            off, because a rule that begins by blocking is a rule whose
            false-positive rate nobody has measured yet.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          New rule
        </button>
      </div>

      <GuardrailsList rules={rules} />

      {creating ? <GuardrailForm onClose={() => setCreating(false)} /> : null}
    </div>
  );
}
