import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { KnowledgeListIssues } from '../KnowledgeListIssues';
import messages from '@/app/messages/en.json';
import type { UserFileType } from '@/features/documents/contracts/document.types';
import type { PairPolicyRaise } from '@/features/documents/utils/knowledge-list-issues';

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const weak: UserFileType = {
  id: 'pl',
  organizationId: 'org',
  fileName: 'polityka.pdf',
  fileSize: 1,
  fileType: 'PDF',
  projectId: null,
  project: null,
  piiPolicy: 'TOXIC_ONLY',
  pairedWith: {
    id: 'en',
    fileName: 'policy.pdf',
    language: 'eng',
    piiPolicy: 'STRICT',
  },
};

function show(
  files: UserFileType[],
  onRaise?: (raises: PairPolicyRaise[]) => void,
) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <KnowledgeListIssues files={files} onRaisePairPolicies={onRaise} />
    </NextIntlClientProvider>,
  );
}

describe('the language-pair PII card', () => {
  it('counts pairs with different policies and raises the weaker one on request', () => {
    const onRaise = vi.fn();
    show([weak], onRaise);
    expect(
      screen.getByText('1 language pair with different PII policies'),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Raise to the stricter policy' }),
    );
    expect(onRaise).toHaveBeenCalledWith([{ fileId: 'pl', raiseTo: 'STRICT' }]);
  });

  it('shows the card without the button to someone who may not change a policy', () => {
    show([weak]);
    expect(
      screen.getByText('1 language pair with different PII policies'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Raise to the stricter policy' }),
    ).not.toBeInTheDocument();
  });

  it('shows nothing when the pair agrees', () => {
    show([
      {
        ...weak,
        pairedWith: { ...weak.pairedWith!, piiPolicy: 'TOXIC_ONLY' },
      },
    ]);
    expect(screen.queryByTestId('knowledge-list-issues')).toBeNull();
  });
});
