import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '@/app/messages/en.json';

const actions = vi.hoisted(() => ({
  applyBrainProposalAction: vi.fn(),
  dismissBrainProposalAction: vi.fn(),
  listBrainAssistantThreadsAction: vi.fn(),
  getBrainAssistantThreadAction: vi.fn(),
}));
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));

vi.mock('../assistant-actions', () => actions);
vi.mock('@/i18n/routing', () => ({
  useRouter: () => router,
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { BrainAssistantShell, BrainAssistantToggle } =
  await import('../components/assistant/BrainAssistantShell');
const { BrainScreen, BrainScreenProvider } =
  await import('../components/assistant/BrainAssistantContext');
const { ProposalCard } = await import('../components/assistant/ProposalCard');

const PAGE = '11111111-2222-4333-8444-555555555555';
const THREAD = '33333333-2222-4333-8444-555555555555';
const MSG = '44444444-2222-4333-8444-555555555555';

function wrap(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function ndjson(events: object[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const e of events) {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        }
        controller.close();
      },
    }),
    { headers: { 'Content-Type': 'application/x-ndjson' } },
  );
}

function shell(props: { enabled?: boolean; canWrite?: boolean } = {}) {
  return wrap(
    <BrainScreenProvider>
      <BrainAssistantShell
        enabled={props.enabled ?? true}
        canWrite={props.canWrite ?? true}
      >
        <BrainAssistantToggle />
        <BrainScreen context={{ view: 'page', pageId: PAGE }} />
        <p>content</p>
      </BrainAssistantShell>
    </BrainScreenProvider>,
  );
}

const approve = {
  id: 'p-1',
  action: 'APPROVE' as const,
  reason: 'Every claim matches its quote',
  outcome: null,
  pages: [{ publicId: PAGE, title: 'Leave policy', updatedAt: 'u' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  vi.stubGlobal('fetch', vi.fn());
});

describe('the assistant panel', () => {
  it('is absent, toggle included, when the assistant is off', () => {
    shell({ enabled: false });
    expect(screen.queryByTestId('brain-assistant-toggle')).toBeNull();
    expect(screen.getByText('content')).toBeVisible();
  });

  it('opens beside the content, remembers it, and offers prompts for the screen', async () => {
    shell();
    fireEvent.click(screen.getByTestId('brain-assistant-toggle'));
    const panel = await screen.findByTestId('brain-assistant-panel');
    expect(screen.getByText('content')).toBeVisible();
    expect(window.localStorage.getItem('ragen.brain-assistant.open')).toBe('1');
    const prompts = within(panel)
      .getAllByTestId('brain-assistant-prompt')
      .map((b) => b.textContent);
    expect(prompts).toContain(
      'Is this page right? Check each claim against its quote',
    );
    expect(prompts).toContain('Who should own this page?');
  });

  it('leaves the change-leading prompts out for a read-only visitor', async () => {
    shell({ canWrite: false });
    fireEvent.click(screen.getByTestId('brain-assistant-toggle'));
    const panel = await screen.findByTestId('brain-assistant-panel');
    const prompts = within(panel)
      .getAllByTestId('brain-assistant-prompt')
      .map((b) => b.textContent);
    expect(prompts).not.toContain('Who should own this page?');
    expect(within(panel).getByText(/suggests no changes/)).toBeVisible();
  });

  it('sends the screen with the question and streams a linked, cited answer', async () => {
    vi.mocked(fetch).mockResolvedValue(
      ndjson([
        { type: 'start', threadId: THREAD },
        { type: 'tool', name: 'getPage' },
        { type: 'text', delta: `[Leave policy](brain:page/${PAGE}) says ` },
        { type: 'text', delta: `"26 days" [source](brain:source/${PAGE}/7). ` },
        { type: 'text', delta: '[elsewhere](https://evil.example)' },
        { type: 'done', messageId: MSG },
      ]),
    );
    shell();
    fireEvent.click(screen.getByTestId('brain-assistant-toggle'));
    fireEvent.change(await screen.findByTestId('brain-assistant-input'), {
      target: { value: 'Is this right?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    const answer = await screen.findByTestId('brain-assistant-answer');
    await waitFor(() =>
      expect(
        within(answer).getByTestId('brain-assistant-link'),
      ).toHaveAttribute('href', `/brain/pages/${PAGE}`),
    );
    expect(
      within(answer).getByTestId('brain-assistant-citation'),
    ).toHaveAttribute('href', `/brain/pages/${PAGE}#source-7`);
    // A link the model wrote to anywhere else is text, not a link.
    expect(within(answer).getByText('elsewhere').closest('a')).toBeNull();
    expect(within(answer).getByText('Read 1 item from Brain')).toBeVisible();

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/brain/assistant');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      question: 'Is this right?',
      screen: { view: 'page', pageId: PAGE },
    });
  });

  it('continues the conversation it started', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        ndjson([
          { type: 'start', threadId: THREAD },
          { type: 'text', delta: 'one' },
          { type: 'done', messageId: MSG },
        ]),
      )
      .mockResolvedValueOnce(
        ndjson([
          { type: 'start', threadId: THREAD },
          { type: 'text', delta: 'two' },
          { type: 'done', messageId: MSG },
        ]),
      );
    shell();
    fireEvent.click(screen.getByTestId('brain-assistant-toggle'));
    const input = await screen.findByTestId('brain-assistant-input');
    fireEvent.change(input, { target: { value: 'first' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('one');
    fireEvent.change(input, { target: { value: 'second' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('two');
    const body = JSON.parse(
      (vi.mocked(fetch).mock.calls[1]![1] as RequestInit).body as string,
    );
    expect(body.threadId).toBe(THREAD);
  });

  it('says why a turn was refused, and shows nothing of a withheld answer', async () => {
    vi.mocked(fetch).mockResolvedValue(
      ndjson([
        { type: 'start', threadId: THREAD },
        { type: 'text', delta: 'partial' },
        { type: 'error', code: 'guardrail' },
        { type: 'done', messageId: MSG },
      ]),
    );
    shell();
    fireEvent.click(screen.getByTestId('brain-assistant-toggle'));
    fireEvent.change(await screen.findByTestId('brain-assistant-input'), {
      target: { value: 'q' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(
      await screen.findByText(/withheld by one of the organization's rules/),
    ).toBeVisible();
    expect(screen.queryByText('partial')).toBeNull();
  });

  it('renders a proposal as a card, and never as text', async () => {
    vi.mocked(fetch).mockResolvedValue(
      ndjson([
        { type: 'start', threadId: THREAD },
        { type: 'proposal', proposal: approve },
        { type: 'text', delta: 'I suggest approving it.' },
        { type: 'done', messageId: MSG },
      ]),
    );
    shell();
    fireEvent.click(screen.getByTestId('brain-assistant-toggle'));
    fireEvent.change(await screen.findByTestId('brain-assistant-input'), {
      target: { value: 'q' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    const card = await screen.findByTestId('brain-proposal');
    expect(within(card).getByText('Approve this page')).toBeVisible();
    expect(within(card).getByRole('button', { name: 'Apply' })).toBeEnabled();
  });

  it('opens an earlier conversation from the history', async () => {
    actions.listBrainAssistantThreadsAction.mockResolvedValue([
      { id: THREAD, title: 'Leave policy check', createdAt: 'x' },
    ]);
    actions.getBrainAssistantThreadAction.mockResolvedValue({
      id: THREAD,
      messages: [
        {
          id: 'a',
          role: 'user',
          text: 'Earlier question',
          proposals: [],
          refused: false,
          createdAt: 'x',
        },
        {
          id: MSG,
          role: 'assistant',
          text: 'Earlier answer',
          proposals: [
            {
              ...approve,
              outcome: {
                status: 'applied',
                at: 'x',
                results: [{ label: 'Leave policy', ok: true }],
              },
            },
          ],
          refused: false,
          createdAt: 'y',
        },
      ],
    });
    shell();
    fireEvent.click(screen.getByTestId('brain-assistant-toggle'));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Earlier conversations' }),
    );
    fireEvent.click(await screen.findByText('Leave policy check'));
    expect(await screen.findByText('Earlier answer')).toBeVisible();
    expect(screen.getByTestId('brain-proposal-outcome')).toHaveTextContent(
      'Applied',
    );
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
  });
});

describe('the assistant panel, while a turn streams', () => {
  it('stops the turn when an earlier conversation is opened, and writes nothing into it', async () => {
    let push: ((line: object) => void) | null = null;
    const encoder = new TextEncoder();
    vi.mocked(fetch).mockImplementation(
      async (_url, init) =>
        new Response(
          new ReadableStream({
            start(controller) {
              push = (line) =>
                controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
              (init as RequestInit).signal?.addEventListener('abort', () =>
                controller.error(new DOMException('aborted', 'AbortError')),
              );
            },
          }),
        ),
    );
    actions.listBrainAssistantThreadsAction.mockResolvedValue([
      { id: THREAD, title: 'Leave policy check', createdAt: 'x' },
    ]);
    actions.getBrainAssistantThreadAction.mockResolvedValue({
      id: THREAD,
      messages: [
        {
          id: MSG,
          role: 'assistant',
          text: 'Earlier answer',
          proposals: [],
          refused: false,
          createdAt: 'y',
        },
      ],
    });
    shell();
    fireEvent.click(screen.getByTestId('brain-assistant-toggle'));
    fireEvent.change(await screen.findByTestId('brain-assistant-input'), {
      target: { value: 'q' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(push).not.toBeNull());
    push!({ type: 'start', threadId: 'other-thread' });
    push!({ type: 'text', delta: 'streaming…' });
    await screen.findByText('streaming…');

    fireEvent.click(
      screen.getByRole('button', { name: 'Earlier conversations' }),
    );
    fireEvent.click(await screen.findByText('Leave policy check'));
    expect(await screen.findByText('Earlier answer')).toBeVisible();

    const signal = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal!;
    expect(signal.aborted).toBe(true);
    expect(screen.queryByText(/streaming/)).toBeNull();
    expect(screen.getByText('Earlier answer').textContent).toBe(
      'Earlier answer',
    );
  });
});

describe('ProposalCard', () => {
  it('applies through the assistant action and refreshes the Brain view', async () => {
    const onChange = vi.fn();
    const applied = {
      ...approve,
      outcome: {
        status: 'applied',
        at: 'x',
        results: [{ label: 'Leave policy', ok: true }],
      },
    };
    actions.applyBrainProposalAction.mockResolvedValue({
      success: true,
      proposal: applied,
    });
    wrap(
      <ProposalCard
        proposal={approve}
        threadId={THREAD}
        messageId={MSG}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(applied));
    expect(actions.applyBrainProposalAction).toHaveBeenCalledWith({
      threadId: THREAD,
      messageId: MSG,
      proposalId: 'p-1',
      confirmWidening: false,
    });
    expect(router.refresh).toHaveBeenCalled();
  });

  it('asks before widening, and applies again only once confirmed', async () => {
    actions.applyBrainProposalAction
      .mockResolvedValueOnce({ success: false, error: 'confirm-widening' })
      .mockResolvedValueOnce({ success: true, proposal: approve });
    wrap(
      <ProposalCard
        proposal={{
          id: 'p-2',
          action: 'SET_ACCESS',
          reason: 'r',
          outcome: null,
          page: approve.pages[0]!,
          principals: ['org:o'],
          preview: {
            before: [],
            after: [{ kind: 'organization' }],
            widens: true,
          },
        }}
        threadId={THREAD}
        messageId={MSG}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/This widens access/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Widen access' }),
    );
    await waitFor(() =>
      expect(actions.applyBrainProposalAction).toHaveBeenLastCalledWith(
        expect.objectContaining({ confirmWidening: true }),
      ),
    );
  });

  it('shows the action’s refusal and the pages it failed on', () => {
    wrap(
      <ProposalCard
        proposal={{
          ...approve,
          outcome: {
            status: 'applied',
            at: 'x',
            results: [{ label: 'Leave policy', ok: false, error: 'conflict' }],
          },
        }}
        threadId={THREAD}
        messageId={MSG}
        onChange={vi.fn()}
      />,
    );
    const outcome = screen.getByTestId('brain-proposal-outcome');
    expect(outcome).toHaveTextContent('Applied to 0 of 1');
    expect(outcome).toHaveTextContent(/Someone changed this page/);
  });

  it('cannot be applied when the turn was not stored', () => {
    wrap(
      <ProposalCard
        proposal={approve}
        threadId={THREAD}
        messageId={null}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  it('dismisses without refreshing Brain', async () => {
    actions.dismissBrainProposalAction.mockResolvedValue({
      success: true,
      proposal: { ...approve, outcome: { status: 'dismissed', at: 'x' } },
    });
    wrap(
      <ProposalCard
        proposal={approve}
        threadId={THREAD}
        messageId={MSG}
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() =>
      expect(actions.dismissBrainProposalAction).toHaveBeenCalled(),
    );
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
