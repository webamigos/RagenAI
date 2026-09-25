import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import messages from '@/app/messages/en.json';

vi.mock('next/image', () => ({
  default: ({ src }: { src: string }) => <img src={src} alt="" />,
}));

const { ToolCallChip } = await import('../ToolCallChip');

const call = (over: object) => ({
  toolCallId: 't',
  toolName: 'rejestrio__lookup_company',
  provider: 'rejestrio',
  startedAt: '2026-09-25T10:00:00.000Z',
  ...over,
});

const iconOf = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  )
    .container.querySelector('img')
    ?.getAttribute('src') ?? null;

describe('ToolCallChip icon', () => {
  it('draws a catalogue entry from the icon the server sent with the call', () => {
    expect(
      iconOf(
        <ToolCallChip
          call={call({ iconUrl: '/assets/connectors/rejestrio.svg' })}
        />,
      ),
    ).toBe('/assets/connectors/rejestrio.svg');
  });

  it('falls back to the built-in map for an event without one', () => {
    expect(
      iconOf(
        <ToolCallChip
          call={call({ toolName: 'clickup__create_task', provider: 'CLICKUP' })}
        />,
      ),
    ).toBe('/assets/connectors/clickup.svg');
  });
});
