import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

const mockCreateApiKey = vi.fn();

vi.mock('../../actions', () => ({
  createApiKey: (...args: unknown[]) => mockCreateApiKey(...args),
  deleteApiKey: vi.fn(),
  toggleApiKey: vi.fn(),
  toggleDebugMode: vi.fn(),
}));

vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { ApiKeysList } from '../ApiKeysList';

const messages = {
  'api-keys': {
    'create-key': 'Create Key',
    'title-create': 'Create API Key',
    name: 'Name',
    'secret-key': 'Secret Key',
    created: 'Created',
    create: 'Create',
    'debug-mode': 'Debug mode',
    'debug-mode-description': 'Persist threads for debugging.',
    active: 'Active',
    'name-is-to-short': 'Name is to short - use at least 3 characters',
    'failed-to-load': 'Failed to load keys',
    assistant: 'Assistant',
    'project-is-required': 'Knowledge source is required',
    scope: 'Scope',
    'scope-knowledge-base': 'Whole knowledge base',
    'scope-knowledge-base-description':
      'Documents that belong to no assistant.',
    'scope-assistant': 'One assistant',
    'scope-assistant-description': 'Only this assistant.',
    'select-assistant': 'Select an assistant',
    dialog: {
      cancel: 'Cancel',
      confirm: 'Confirm',
      'remove-key': { title: 'Remove API key', description: 'Sure?' },
      'api-key-generated': {
        copied: 'API Key copied!',
        title: 'Save your API key',
        description: 'Copy it now.',
      },
    },
    copy: 'Copy',
    done: 'Done',
  },
};

const assistants = [
  { id: 'proj-a', title: 'Support bot' },
  { id: 'proj-b', title: 'Sales bot' },
];

function renderList(
  initialKeys: Parameters<typeof ApiKeysList>[0]['initialKeys'] = [],
) {
  return render(
    <NextIntlClientProvider messages={messages} locale="en">
      <ApiKeysList initialKeys={initialKeys} assistants={assistants} />
    </NextIntlClientProvider>,
  );
}

describe('ApiKeysList — the key carries a scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateApiKey.mockResolvedValue({
      id: 'key-1',
      name: 'n8n',
      maskedValue: 'sk-...abcd',
      fullKey: 'sk-key-1.secret',
    });
  });

  it('shows what an existing key reaches, by assistant name', () => {
    renderList([
      {
        id: 'key-1',
        name: 'n8n',
        maskedValue: 'sk-...abcd',
        isActive: true,
        debugMode: false,
        createdAt: new Date('2026-09-17'),
        knowledgeScope: 'ASSISTANT',
        projectId: 'proj-a',
        project: { title: 'Support bot' },
      },
      {
        id: 'key-2',
        name: 'zapier',
        maskedValue: 'sk-...efgh',
        isActive: true,
        debugMode: false,
        createdAt: new Date('2026-09-17'),
        knowledgeScope: 'KNOWLEDGE_BASE',
        projectId: null,
        project: null,
      },
    ]);

    expect(screen.getByText('Support bot')).toBeInTheDocument();
    expect(screen.getByText('Whole knowledge base')).toBeInTheDocument();
  });

  // The default is the narrower thing to explain and the wider thing to
  // reach: a key nobody thought about answers from the knowledge base and is
  // bound to no assistant.
  it('creates a knowledge-base key without naming an assistant', async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole('button', { name: 'Create Key' }));
    await user.type(screen.getByRole('textbox'), 'zapier');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockCreateApiKey).toHaveBeenCalledWith({
        name: 'zapier',
        debugMode: false,
        knowledgeScope: 'KNOWLEDGE_BASE',
      });
    });
  });

  it('sends the chosen assistant when the key is scoped to one', async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole('button', { name: 'Create Key' }));
    await user.type(screen.getByRole('textbox'), 'n8n');
    await user.click(screen.getByLabelText(/One assistant/));
    await user.selectOptions(screen.getByLabelText('Assistant'), 'proj-b');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockCreateApiKey).toHaveBeenCalledWith({
        name: 'n8n',
        debugMode: false,
        knowledgeScope: 'ASSISTANT',
        projectId: 'proj-b',
      });
    });
  });

  // The command refuses this combination too; catching it here keeps the
  // round trip out of it and names the field.
  it('refuses to submit an assistant scope with no assistant chosen', async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole('button', { name: 'Create Key' }));
    await user.type(screen.getByRole('textbox'), 'n8n');
    await user.click(screen.getByLabelText(/One assistant/));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(
      await screen.findByText('Knowledge source is required'),
    ).toBeInTheDocument();
    expect(mockCreateApiKey).not.toHaveBeenCalled();
  });

  it('does not offer an assistant picker for a knowledge-base key', async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole('button', { name: 'Create Key' }));

    expect(screen.queryByLabelText('Assistant')).not.toBeInTheDocument();
  });
});
