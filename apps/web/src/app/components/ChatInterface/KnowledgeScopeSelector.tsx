'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckIcon } from '@heroicons/react/20/solid';
import {
  KNOWLEDGE_SCOPES,
  type KnowledgeScope,
} from '@ragenai/platform-contracts';

import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * How much of the knowledge base this thread may reach.
 *
 * Gap 10 of design system v2. Three levels, and the scope belongs to the
 * **thread**: it is chosen before the first message and fixed for the
 * thread's life. Per-message scope would mean an answer three turns up was
 * grounded in the knowledge base and the one below it was not, with nothing on
 * screen saying so — a transcript nobody can reason about. The trigger's
 * footnote says as much, because the consequence (changing your mind means a
 * new thread) is worth stating rather than discovering.
 *
 * **`ASSISTANT` is disabled unless it can actually be sent.** The server
 * rejects that scope with no resolvable project rather than quietly widening
 * the search to the whole knowledge base — a client bug must not turn into a
 * broader answer. That rejection is only defensible if the UI cannot produce
 * the combination, so there are two reasons it can be unavailable, and they
 * are different: you have no assistants at all, or you have not named one for
 * this thread yet.
 */
const SCOPE_KEYS: Record<KnowledgeScope, string> = {
  KNOWLEDGE_BASE: 'knowledge-base',
  ASSISTANT: 'assistant',
  MODEL_ONLY: 'model-only',
};

type Props = {
  value: KnowledgeScope;
  onChange: (scope: KnowledgeScope) => void;
  /** The assistant this thread targets, if one has been named. */
  assistantName?: string | null;
  /** Whether the person has any assistants to choose from at all. */
  hasAssistants: boolean;
  disabled?: boolean;
};

export const KnowledgeScopeSelector = ({
  value,
  onChange,
  assistantName,
  hasAssistants,
  disabled = false,
}: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const t = useTranslations('assistant.knowledge-scope');

  // Two different reasons, in order of how much they teach: not having any
  // assistants is worth saying before "you have not named one", because the
  // second is meaningless to someone for whom the first is true.
  const assistantUnavailableReason = (() => {
    if (!hasAssistants) {
      return t('no-assistants');
    }
    if (!assistantName) {
      return t('pick-assistant');
    }
    return null;
  })();

  const isUnavailable = (scope: KnowledgeScope) =>
    scope === 'ASSISTANT' && assistantUnavailableReason !== null;

  const select = (scope: KnowledgeScope) => {
    if (isUnavailable(scope)) {
      return;
    }
    onChange(scope);
    setIsOpen(false);
  };

  // The trigger shows the assistant's own name rather than the word
  // "Assistant" — at that level the name is the useful half.
  const triggerLabel =
    value === 'ASSISTANT' && assistantName
      ? assistantName
      : t(SCOPE_KEYS[value]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-colors duration-150',
            disabled
              ? 'cursor-not-allowed text-muted-foreground/50'
              : 'cursor-pointer text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
          aria-label={t('label')}
        >
          <span className="text-muted-foreground/70">{t('label')}:</span>
          {/*
            Wide enough for the longest level name; an assistant's own name can
            be anything, so it still truncates rather than pushing the model
            selector out of the bar.
          */}
          <span className="max-w-[16ch] truncate">{triggerLabel}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-72 p-1">
        <ul role="listbox" aria-label={t('label')}>
          {KNOWLEDGE_SCOPES.map((scope) => {
            const unavailable = isUnavailable(scope);
            const selected = scope === value;
            return (
              <li key={scope}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  aria-disabled={unavailable}
                  onClick={() => select(scope)}
                  className={cn(
                    'flex w-full items-start gap-2 rounded-md px-2 py-2 text-left',
                    unavailable
                      ? 'cursor-not-allowed opacity-60'
                      : 'cursor-pointer hover:bg-muted',
                  )}
                >
                  <CheckIcon
                    aria-hidden="true"
                    className={cn(
                      'mt-0.5 size-4 shrink-0',
                      selected ? 'text-primary' : 'invisible',
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm text-foreground">
                      {t(SCOPE_KEYS[scope])}
                      {scope === 'ASSISTANT' && assistantName ? (
                        <span className="text-muted-foreground">
                          {' '}
                          · {assistantName}
                        </span>
                      ) : null}
                    </span>
                    {/*
                      A disabled option that does not say why teaches nothing,
                      and hiding it would leave the reader wondering whether
                      the feature exists at all. Someone with no assistants is
                      exactly the person who should learn that assistants are
                      a thing.
                    */}
                    <span className="block text-xs text-muted-foreground">
                      {unavailable
                        ? assistantUnavailableReason
                        : t(`${SCOPE_KEYS[scope]}-description`)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <p className="border-t border-border px-2 pt-2 pb-1 text-xs text-muted-foreground">
          {t('thread-note')}
        </p>
      </PopoverContent>
    </Popover>
  );
};
