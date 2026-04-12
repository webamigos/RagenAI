import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { ToolConfirmationCard } from '../ToolConfirmationCard';
import type { PendingToolApproval } from '@/store/tool-approvals/toolApprovalsSlice';

const messages = {
  'tool-confirmation': {
    'aria-label': 'Tool call confirmation',
    title: 'Confirm tool action',
    description:
      'This action has side effects and the current conversation includes retrieved knowledge-base content. Approve only if the request matches your intent.',
    'tool-label': 'Tool',
    'provider-label': 'Provider',
    approve: 'Approve',
    deny: 'Deny',
    'approve-prompt': 'Yes, please proceed with {toolName}.',
    'deny-prompt': 'No, cancel that tool call.',
  },
};

function renderCard(props: {
  approval?: PendingToolApproval;
  onApprove?: (a: PendingToolApproval) => void;
  onDeny?: (a: PendingToolApproval) => void;
  disabled?: boolean;
}) {
  const approval: PendingToolApproval = props.approval ?? {
    approvalId: 'apr-1',
    toolCallId: 'tc-1',
    toolName: 'google_calendar__gcal_create_event',
    provider: 'google_calendar',
    createdAt: '2026-04-11T12:00:00Z',
  };
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ToolConfirmationCard
        approval={approval}
        onApprove={props.onApprove ?? vi.fn()}
        onDeny={props.onDeny ?? vi.fn()}
        disabled={props.disabled}
      />
    </NextIntlClientProvider>,
  );
}

describe('ToolConfirmationCard', () => {
  it('renders the title, description, and buttons', () => {
    renderCard({});
    expect(screen.getByText('Confirm tool action')).toBeInTheDocument();
    expect(
      screen.getByText(/This action has side effects/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId('tool-confirmation-approve')).toHaveTextContent(
      'Approve',
    );
    expect(screen.getByTestId('tool-confirmation-deny')).toHaveTextContent(
      'Deny',
    );
  });

  it('humanizes the tool name (strips provider prefix, replaces underscores)', () => {
    renderCard({});
    // "google_calendar__gcal_create_event" → "gcal create event"
    expect(screen.getByText(/gcal create event/i)).toBeInTheDocument();
  });

  it('humanizes the provider slug (title case)', () => {
    renderCard({});
    // "google_calendar" → "Google Calendar"
    expect(screen.getByText(/Google Calendar/)).toBeInTheDocument();
  });

  it('fires onApprove with the approval payload when Approve is clicked', async () => {
    const onApprove = vi.fn();
    const approval: PendingToolApproval = {
      approvalId: 'apr-xyz',
      toolCallId: 'tc-xyz',
      toolName: 'slack__slack_send_message',
      provider: 'slack',
      createdAt: '2026-04-11T12:00:00Z',
    };
    renderCard({ approval, onApprove });

    await userEvent.click(screen.getByTestId('tool-confirmation-approve'));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onApprove).toHaveBeenCalledWith(approval);
  });

  it('fires onDeny with the approval payload when Deny is clicked', async () => {
    const onDeny = vi.fn();
    const approval: PendingToolApproval = {
      approvalId: 'apr-xyz',
      toolCallId: 'tc-xyz',
      toolName: 'slack__slack_send_message',
      provider: 'slack',
      createdAt: '2026-04-11T12:00:00Z',
    };
    renderCard({ approval, onDeny });

    await userEvent.click(screen.getByTestId('tool-confirmation-deny'));
    expect(onDeny).toHaveBeenCalledTimes(1);
    expect(onDeny).toHaveBeenCalledWith(approval);
  });

  it('does not fire callbacks when disabled', async () => {
    const onApprove = vi.fn();
    const onDeny = vi.fn();
    renderCard({ onApprove, onDeny, disabled: true });

    await userEvent.click(screen.getByTestId('tool-confirmation-approve'));
    await userEvent.click(screen.getByTestId('tool-confirmation-deny'));
    expect(onApprove).not.toHaveBeenCalled();
    expect(onDeny).not.toHaveBeenCalled();
  });

  it('has an accessible region label', () => {
    renderCard({});
    expect(
      screen.getByRole('region', { name: 'Tool call confirmation' }),
    ).toBeInTheDocument();
  });
});
