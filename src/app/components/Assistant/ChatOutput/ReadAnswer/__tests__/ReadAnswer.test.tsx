import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ReadAnswer } from '../ReadAnswer';

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('../../elevenLabsTTS', () => ({
  convertTextToSpeech: vi.fn().mockResolvedValue('blob:test'),
}));

vi.mock('../../../../MyProfile/ChatInstanceSettings/AudioPlayer', () => ({
  AudioPlayer: () => <audio data-testid="audio-player" />,
}));

const messages = {
  'read-answer': {
    listen: 'Read answer aloud',
  },
};

function renderReadAnswer() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ReadAnswer content="Hello" voiceId="voice-1" messageId="msg-1" />
    </NextIntlClientProvider>,
  );
}

describe('ReadAnswer', () => {
  it('renders the listen button', () => {
    renderReadAnswer();
    expect(screen.getByTestId('read-answer-btn')).toBeInTheDocument();
  });

  it('listen button has data-tooltip-id attribute', () => {
    renderReadAnswer();
    const btn = screen.getByTestId('read-answer-btn');
    expect(btn.closest('[data-tooltip-id]')).toBeTruthy();
  });
});
