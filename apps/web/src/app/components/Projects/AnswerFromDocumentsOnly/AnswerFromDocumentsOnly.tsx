'use client';

import { useEffect, useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DocumentCheckIcon } from '@heroicons/react/24/outline';

import { Switch } from '@/components/ui/switch';
import { statusToast } from '@/app/lib/utils/toast';
import {
  getAnswerFromDocumentsOnlyAction,
  saveAnswerFromDocumentsOnlyAction,
  type AnswerFromDocumentsOnlyState,
} from './actions';

type Props = {
  projectId: string;
};

/**
 * One switch on the assistant page: answer only from the documents, or let
 * the model answer from its own knowledge and say so. It shows the effective
 * state, so an assistant nobody has set shows its surface default — on when
 * the public chatbot is enabled — with a line saying that is a default.
 */
export function AnswerFromDocumentsOnly({ projectId }: Props) {
  const t = useTranslations('projects.project-view.answer-from-documents-only');
  const { errorToast } = statusToast();
  const switchId = useId();
  const descriptionId = useId();
  const [state, setState] = useState<AnswerFromDocumentsOnlyState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAnswerFromDocumentsOnlyAction(projectId).then((result) => {
      if (!cancelled) {
        setState(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Not rendered until there is something true to say: a switch drawn in a
  // guessed position would claim a behaviour the assistant may not have.
  if (!state) {
    return null;
  }

  const handleChange = async (checked: boolean) => {
    const previous = state;
    setState({ ...state, setting: checked, effective: checked });
    setSaving(true);
    const result = await saveAnswerFromDocumentsOnlyAction(projectId, checked);
    setSaving(false);
    if (!result.success) {
      setState(previous);
      errorToast({ message: t('save-failed') });
    }
  };

  let note = t('set-for-assistant');
  if (state.setting === null) {
    note = state.chatbotEnabled ? t('default-chatbot') : t('default-panel');
  }

  return (
    <div
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
      data-testid="answer-from-documents-only"
    >
      <div className="flex items-center justify-between gap-3">
        <label
          htmlFor={switchId}
          className="flex items-center gap-1.5 text-sm font-semibold"
        >
          <DocumentCheckIcon className="size-4 text-muted-foreground" />
          {t('title')}
        </label>
        <Switch
          id={switchId}
          checked={state.effective}
          onCheckedChange={handleChange}
          disabled={!state.canManage || saving}
          aria-describedby={descriptionId}
          data-testid="answer-from-documents-only-switch"
        />
      </div>
      <p id={descriptionId} className="mt-2 text-xs text-muted-foreground">
        {t('description')}
      </p>
      <p
        className="mt-1 text-xs text-muted-foreground"
        data-testid="answer-from-documents-only-note"
      >
        {note}
      </p>
    </div>
  );
}
