import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../actions', () => ({ chooseMcpWorkspace: vi.fn() }));
import { WorkspaceForm } from '../WorkspaceForm';
describe('MCP workspace choice', () => {
  it('shows only the selected organization assistants and resets the pick on organization change', async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceForm
        query="signed-query"
        organizations={[
          {
            id: 'org-a',
            name: 'Team A',
            assistants: [{ id: 'assistant-a', title: 'HR' }],
          },
          {
            id: 'org-b',
            name: 'Team B',
            assistants: [{ id: 'assistant-b', title: 'Sales' }],
          },
        ]}
      />,
    );
    await user.selectOptions(screen.getByLabelText('Assistant'), 'assistant-a');
    expect(screen.queryByRole('option', { name: 'Sales' })).toBeNull();
    await user.selectOptions(screen.getByLabelText('Organization'), 'org-b');
    expect(screen.queryByRole('option', { name: 'HR' })).toBeNull();
    expect(screen.getByLabelText('Assistant')).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Sales' })).toHaveValue(
      'assistant-b',
    );
  });
});
