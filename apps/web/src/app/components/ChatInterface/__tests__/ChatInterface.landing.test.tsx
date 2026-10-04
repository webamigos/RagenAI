import { describe, it, expect, vi, beforeEach } from 'vitest';
import { forwardRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

import messages from '@/app/messages/en.json';

// The landing state of /new: greeting, composer, suggestion chips, tip. The
// composer's own internals are tested in MentionTextarea.test.tsx; here it is a
// plain textarea, so what is under test is the page around it.

const auth = vi.hoisted(() => ({ canManageOrg: false }));

vi.mock('@/app/hooks/use-auth', () => ({
  useOrganization: () => ({
    organization: { id: 'org-1' },
    canManageOrg: auth.canManageOrg,
  }),
  useUser: () => ({ user: { id: 'user-1', name: 'Joe Doe' } }),
  useAuth: () => ({ orgId: 'org-1' }),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/app/lib/actions/getOrganizationSettings', () => ({
  getOrganizationSettings: vi.fn().mockResolvedValue({ success: false }),
}));

vi.mock('@/features/projects/services/queries/get-user-projects-query', () => ({
  getUserProjectsQuery: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/app/hooks/useOrgFeatures', () => ({
  useOrgFeature: () => false,
}));

vi.mock('@/app/components/PageDropOverlay', () => ({
  PageDropOverlay: () => null,
  usePageDrop: () => ({ isDragging: false }),
}));

vi.mock('../ModelSelectorInline', () => ({ ModelSelectorInline: () => null }));
vi.mock('../KnowledgeScopeSelector', () => ({
  KnowledgeScopeSelector: () => null,
}));

vi.mock('../useNewThreadInput', () => ({
  useNewThreadInput: ({ initialPrompt }: { initialPrompt?: string }) => {
    const [prompt, setPrompt] = useState(initialPrompt ?? '');
    return {
      prompt,
      isLoading: false,
      isPending: false,
      handleInputChange: setPrompt,
      handleKeyDown: vi.fn(),
      handleSubmit: vi.fn(),
      errors: {},
      setMentionedProjectInHook: vi.fn(),
    };
  },
}));

vi.mock('../MentionTextarea', () => ({
  MentionTextarea: forwardRef<
    HTMLTextAreaElement,
    {
      value: string;
      onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
      placeholder?: string;
    }
  >(function MentionTextarea({ value, onChange, placeholder }, ref) {
    return (
      <textarea
        ref={ref}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-label="composer"
      />
    );
  }),
}));

import { ChatInterface } from '../ChatInterface';

const renderLanding = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ChatInterface />
    </NextIntlClientProvider>,
  );

/** The block the empty state centres; its children decide where the input sits. */
const layoutOf = (composer: HTMLElement) => {
  const wrapper = composer.parentElement as HTMLElement;
  const block = wrapper.parentElement as HTMLElement;
  return {
    wrapper,
    children: Array.from(block.children),
    indexOfComposer: Array.from(block.children).indexOf(wrapper),
  };
};

describe('ChatInterface — the empty /new landing', () => {
  beforeEach(() => {
    auth.canManageOrg = false;
  });

  it('keeps the composer in place when typing starts — the chips hide, they do not unmount', async () => {
    renderLanding();
    const composer = screen.getByRole('textbox', { name: 'composer' });
    const before = layoutOf(composer);

    expect(
      screen.getByRole('region', { name: 'Start from' }),
    ).toBeInTheDocument();

    await userEvent.type(composer, 'What does our policy say');

    const after = layoutOf(composer);
    // Same element, same siblings, same order: nothing above or below the
    // composer was added or removed, so a centred block keeps its height.
    expect(after.wrapper).toBe(before.wrapper);
    expect(after.children).toEqual(before.children);
    expect(after.indexOfComposer).toBe(before.indexOfComposer);

    const section = document.querySelector(
      'section[aria-labelledby="start-from-heading"]',
    );
    expect(section).toBeInTheDocument();
    expect(section).toHaveAttribute('data-state', 'hidden');
    expect(section).toHaveClass('invisible');
    expect(screen.queryByRole('region', { name: 'Start from' })).toBeNull();
  });

  it('shows the chips again once the draft is cleared', async () => {
    renderLanding();
    const composer = screen.getByRole('textbox', { name: 'composer' });

    await userEvent.type(composer, 'abc');
    await userEvent.clear(composer);

    expect(
      screen.getByRole('region', { name: 'Start from' }),
    ).toBeInTheDocument();
  });

  it('a chip fills the composer and hides the row', async () => {
    renderLanding();

    await userEvent.click(
      screen.getByRole('button', { name: 'Summarize a document' }),
    );

    expect(screen.getByRole('textbox', { name: 'composer' })).toHaveValue(
      'Summarize [document name] and list the key takeaways.',
    );
    expect(screen.queryByRole('region', { name: 'Start from' })).toBeNull();
  });

  it('sends a manager to the organization connectors', () => {
    auth.canManageOrg = true;
    renderLanding();

    expect(
      screen.getByRole('link', { name: 'Open connectors settings' }),
    ).toHaveAttribute('href', '/organization/connectors');
  });

  it('sends a member to their own connectors — /organization would redirect them', () => {
    renderLanding();

    expect(
      screen.getByRole('link', { name: 'Open connectors settings' }),
    ).toHaveAttribute('href', '/settings/connectors');
  });
});
