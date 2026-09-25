'use client';

import {
  ArrowUpIcon,
  ClockIcon,
  PlusIcon,
  StopIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  MAX_QUESTION_LENGTH,
  type BrainAssistantError,
  type BrainAssistantMessageView,
  type BrainAssistantThreadSummary,
  type BrainProposal,
} from '@/features/brain-assistant/contracts/brain-assistant.types';
import { readEventStream } from '@/features/brain-assistant/utils/read-event-stream';
import { suggestedPromptKeys } from '@/features/brain-assistant/utils/suggested-prompts';

import {
  getBrainAssistantThreadAction,
  listBrainAssistantThreadsAction,
} from '../../assistant-actions';
import { AssistantAnswer } from './AssistantAnswer';
import { useBrainScreen } from './BrainAssistantContext';
import { ProposalCard } from './ProposalCard';

type PanelMessage = {
  key: string;
  role: 'user' | 'assistant';
  text: string;
  proposals: BrainProposal[];
  /** The stored message's id, once the server has one. */
  messageId: string | null;
  refused: boolean;
  tools: number;
  streaming: boolean;
  error: BrainAssistantError | null;
  droppedProposal: boolean;
};

let sequence = 0;
const nextKey = () => `m${++sequence}`;

function fromStored(m: BrainAssistantMessageView): PanelMessage {
  return {
    key: m.id,
    role: m.role,
    text: m.text,
    proposals: m.proposals,
    messageId: m.id,
    refused: m.refused,
    tools: 0,
    streaming: false,
    error: null,
    droppedProposal: false,
  };
}

/**
 * The operator's assistant (spec "Panel", "Answering", C1): a conversation
 * about what is on screen, streamed from `/api/brain/assistant`, with the
 * proposals it makes rendered as cards. Conversations are kept; the history
 * lists the person's own.
 */
export function BrainAssistantPanel({
  canWrite,
  width,
  onResize,
  onClose,
}: {
  canWrite: boolean;
  width: number;
  onResize: (width: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations('brain.assistant');
  const screen = useBrainScreen();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<PanelMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<BrainAssistantThreadSummary[] | null>(
    null,
  );
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: 'end' });
  }, [messages]);

  useEffect(() => () => abort.current?.abort(), []);

  // Each turn patches its own message by key — never "the last one": the
  // operator can open another conversation while a turn is still streaming.
  const patch = useCallback(
    (key: string, change: (m: PanelMessage) => PanelMessage) =>
      setMessages((all) => all.map((m) => (m.key === key ? change(m) : m))),
    [],
  );

  async function send(question: string) {
    const text = question.trim();
    if (!text || busy) {
      return;
    }
    setDraft('');
    setHistory(null);
    setBusy(true);
    const answer = { ...blank('assistant'), streaming: true };
    const patchAnswer = (change: (m: PanelMessage) => PanelMessage) =>
      patch(answer.key, change);
    setMessages((all) => [...all, { ...blank('user'), text }, answer]);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const response = await fetch('/api/brain/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(threadId ? { threadId } : {}),
          question: text,
          screen,
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        patchAnswer((m) => ({ ...m, error: 'unknown' }));
        return;
      }
      for await (const event of readEventStream(response.body)) {
        switch (event.type) {
          case 'start':
            if (!controller.signal.aborted) {
              setThreadId(event.threadId);
            }
            break;
          case 'text':
            patchAnswer((m) => ({ ...m, text: m.text + event.delta }));
            break;
          case 'tool':
            patchAnswer((m) => ({ ...m, tools: m.tools + 1 }));
            break;
          case 'proposal':
            patchAnswer((m) => ({
              ...m,
              proposals: [...m.proposals, event.proposal],
            }));
            break;
          case 'proposal-dropped':
            patchAnswer((m) => ({ ...m, droppedProposal: true }));
            break;
          case 'error':
            patchAnswer((m) => ({
              ...m,
              error: event.code,
              ...(event.code === 'guardrail'
                ? { text: '', proposals: [], refused: true }
                : {}),
            }));
            break;
          case 'done':
            patchAnswer((m) => ({ ...m, messageId: event.messageId }));
            break;
        }
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        patchAnswer((m) => ({ ...m, error: 'unknown' }));
      }
    } finally {
      patchAnswer((m) => ({ ...m, streaming: false }));
      abort.current = null;
      setBusy(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void send(draft);
    }
  }

  async function openHistory() {
    if (history) {
      setHistory(null);
      return;
    }
    setHistory(await listBrainAssistantThreadsAction());
  }

  async function openThread(id: string) {
    abort.current?.abort();
    const thread = await getBrainAssistantThreadAction(id);
    setHistory(null);
    if (thread) {
      setThreadId(thread.id);
      setMessages(thread.messages.map(fromStored));
    }
  }

  function startOver() {
    abort.current?.abort();
    setThreadId(null);
    setMessages([]);
    setHistory(null);
  }

  const replaceProposal = (messageKey: string, proposal: BrainProposal) =>
    setMessages((all) =>
      all.map((m) =>
        m.key === messageKey
          ? {
              ...m,
              proposals: m.proposals.map((p) =>
                p.id === proposal.id ? proposal : p,
              ),
            }
          : m,
      ),
    );

  return (
    <aside
      id="brain-assistant-panel"
      aria-label={t('title')}
      data-testid="brain-assistant-panel"
      style={{ ['--panel-width' as string]: `${width}px` }}
      className="fixed inset-0 z-40 flex flex-col bg-background shadow-lg lg:sticky lg:inset-auto lg:top-4 lg:z-auto lg:h-[calc(100dvh-4rem)] lg:ml-4 lg:w-[var(--panel-width)] lg:shrink-0 lg:rounded-[6px] lg:border lg:border-border lg:shadow-none"
    >
      <ResizeHandle width={width} onResize={onResize} label={t('resize')} />
      <header className="flex items-center gap-1 border-b border-border px-3 py-2">
        <h2 className="mr-auto text-sm font-semibold text-foreground">
          {t('title')}
        </h2>
        <Button
          size="icon"
          variant="ghost"
          aria-label={t('history')}
          aria-expanded={history !== null}
          onClick={() => void openHistory()}
        >
          <ClockIcon className="size-4" aria-hidden="true" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label={t('new')}
          onClick={startOver}
        >
          <PlusIcon className="size-4" aria-hidden="true" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label={t('close')}
          onClick={onClose}
        >
          <XMarkIcon className="size-4" aria-hidden="true" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {history !== null && (
          <HistoryList threads={history} onOpen={(id) => void openThread(id)} />
        )}
        {history === null && messages.length === 0 && (
          <EmptyState
            prompts={suggestedPromptKeys(
              screen.view,
              canWrite,
              screen.view === 'graph' && Boolean(screen.selectedPageId),
            )}
            onPick={(prompt) => void send(prompt)}
          />
        )}
        {history === null && messages.length > 0 && (
          <ol className="space-y-4" aria-live="polite">
            {messages.map((m) => (
              <li key={m.key} data-role={m.role}>
                {m.role === 'user' ? (
                  <p className="ml-8 whitespace-pre-wrap rounded-[6px] bg-muted px-3 py-2 text-sm text-foreground">
                    {m.text}
                  </p>
                ) : (
                  <AssistantTurn
                    message={m}
                    threadId={threadId}
                    onProposal={(p) => replaceProposal(m.key, p)}
                  />
                )}
              </li>
            ))}
          </ol>
        )}
        <div ref={bottom} />
      </div>

      <form
        className="border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
      >
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            maxLength={MAX_QUESTION_LENGTH}
            rows={2}
            placeholder={t('placeholder')}
            aria-label={t('placeholder')}
            data-testid="brain-assistant-input"
            className="min-h-[44px] resize-none text-sm"
          />
          {busy ? (
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label={t('stop')}
              onClick={() => abort.current?.abort()}
            >
              <StopIcon className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              aria-label={t('send')}
              disabled={!draft.trim()}
            >
              <ArrowUpIcon className="size-4" aria-hidden="true" />
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {canWrite ? t('footnote') : t('footnote-read-only')}
        </p>
      </form>
    </aside>
  );
}

function blank(role: 'user' | 'assistant'): PanelMessage {
  return {
    key: nextKey(),
    role,
    text: '',
    proposals: [],
    messageId: null,
    refused: false,
    tools: 0,
    streaming: false,
    error: null,
    droppedProposal: false,
  };
}

function AssistantTurn({
  message,
  threadId,
  onProposal,
}: {
  message: PanelMessage;
  threadId: string | null;
  onProposal: (proposal: BrainProposal) => void;
}) {
  const t = useTranslations('brain.assistant');
  return (
    <div data-testid="brain-assistant-answer">
      {message.tools > 0 && (
        <p className="mb-1 text-xs text-muted-foreground">
          {t('read', { count: message.tools })}
        </p>
      )}
      <AnswerBody message={message} />
      {message.proposals.map((proposal) => (
        <ProposalCard
          key={proposal.id}
          proposal={proposal}
          threadId={threadId}
          messageId={message.messageId}
          onChange={onProposal}
        />
      ))}
      {message.droppedProposal && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t('proposal-dropped')}
        </p>
      )}
      {message.error && message.error !== 'guardrail' && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {t(`errors.${message.error}`)}
        </p>
      )}
    </div>
  );
}

function AnswerBody({ message }: { message: PanelMessage }) {
  const t = useTranslations('brain.assistant');
  if (message.refused) {
    return (
      <p className="text-sm text-muted-foreground">{t('errors.guardrail')}</p>
    );
  }
  if (message.text) {
    return <AssistantAnswer text={message.text} />;
  }
  return message.streaming ? (
    <p className="text-sm text-muted-foreground">{t('thinking')}</p>
  ) : null;
}

function EmptyState({
  prompts,
  onPick,
}: {
  prompts: string[];
  onPick: (prompt: string) => void;
}) {
  const t = useTranslations('brain.assistant');
  return (
    <div data-testid="brain-assistant-empty">
      <p className="text-sm text-foreground">{t('empty-title')}</p>
      <p className="mt-1 text-[13px] text-muted-foreground">
        {t('empty-description')}
      </p>
      <ul className="mt-3 space-y-1.5">
        {prompts.map((key) => (
          <li key={key}>
            <button
              type="button"
              data-testid="brain-assistant-prompt"
              onClick={() => onPick(t(`prompts.${key}`))}
              className="w-full rounded-[6px] border border-border px-3 py-2 text-left text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t(`prompts.${key}`)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HistoryList({
  threads,
  onOpen,
}: {
  threads: BrainAssistantThreadSummary[];
  onOpen: (id: string) => void;
}) {
  const t = useTranslations('brain.assistant');
  if (threads.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t('history-empty')}</p>
    );
  }
  return (
    <ul className="space-y-1" data-testid="brain-assistant-history">
      {threads.map((thread) => (
        <li key={thread.id}>
          <button
            type="button"
            onClick={() => onOpen(thread.id)}
            className="w-full truncate rounded-[6px] px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
          >
            {thread.title || t('untitled')}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The panel's left edge. Dragged with a pointer, or moved with the arrow keys
 * — a separator a keyboard cannot move is not resizable for everyone.
 */
function ResizeHandle({
  width,
  onResize,
  label,
}: {
  width: number;
  onResize: (width: number) => void;
  label: string;
}) {
  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const move = (e: PointerEvent) =>
      onResize(startWidth + (startX - e.clientX));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          onResize(width + 24);
        } else if (event.key === 'ArrowRight') {
          onResize(width - 24);
        }
      }}
      className="absolute inset-y-0 left-0 hidden w-1.5 -translate-x-1/2 cursor-col-resize focus-visible:bg-ring lg:block"
    />
  );
}
