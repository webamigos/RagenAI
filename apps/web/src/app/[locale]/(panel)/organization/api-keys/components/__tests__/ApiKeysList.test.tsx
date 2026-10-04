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
    'failed-to-create': 'Could not create the API key.',
    'create-unavailable-plan': 'Not available in your plan.',
    'create-unavailable-demo': 'Not available in demo mode.',
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
  creation: { allowCreate?: boolean; demoAccount?: boolean } = {},
) {
  return render(
    <NextIntlClientProvider messages={messages} locale="en">
      <ApiKeysList
        initialKeys={initialKeys}
        assistants={assistants}
        allowCreate={creation.allowCreate ?? true}
        demoAccount={creation.demoAccount}
      />
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

  // A screen reader announces the field by its label, and Playwright's
  // getByLabel finds it the same way; a label beside the input is not enough.
  it('labels the name input so it can be found by its label', async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole('button', { name: 'Create Key' }));

    const input = screen.getByLabelText('Name');
    expect(input).toBe(screen.getByRole('textbox', { name: 'Name' }));

    await user.type(input, 'zapier');
    expect(input).toHaveValue('zapier');
  });

  it('does not offer an assistant picker for a knowledge-base key', async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole('button', { name: 'Create Key' }));

    expect(screen.queryByLabelText('Assistant')).not.toBeInTheDocument();
  });
});

describe('ApiKeysList — when a key cannot be created', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Offering the form to an organization without API access only moved the
  // failure to submit, where it read as "failed to load keys".
  it('offers no create button, and says why, when the plan has no API access', () => {
    renderList([], { allowCreate: false });

    expect(
      screen.queryByRole('button', { name: /create key/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Not available in your plan.')).toBeInTheDocument();
  });

  it('says demo, not plan, on the shared demo account', () => {
    renderList([], { allowCreate: false, demoAccount: true });

    expect(screen.getByText('Not available in demo mode.')).toBeInTheDocument();
    expect(
      screen.queryByText('Not available in your plan.'),
    ).not.toBeInTheDocument();
  });

  it('says the key was not created when creating fails', async () => {
    mockCreateApiKey.mockRejectedValue(new Error('vault unreachable'));
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole('button', { name: /create key/i }));
    await user.type(screen.getByLabelText('Name'), 'n8n');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    expect(
      await screen.findByText('Could not create the API key.'),
    ).toBeInTheDocument();
  });
});
