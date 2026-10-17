import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAvailableModelsForOrganization = vi.hoisted(() => vi.fn());
vi.mock('@/app/lib/actions/checkAvailableProviders', () => ({
  getAvailableModelsForOrganization,
}));
vi.mock('@/app/hooks/use-auth', () => ({
  useOrganization: () => ({ organization: { id: 'org-1' } }),
}));
vi.mock('@/config/public-runtime-config', () => ({
  publicRuntimeConfig: () => ({ hideModelSelector: '' }),
}));

import { ThreadModelLabel, resetServedModelsCache } from '../ThreadModelLabel';
import { availableModels } from '../../../config';

const local = {
  value: 'local-chat',
  label: 'Bielik 11B',
  provider: 'litellm' as const,
  origin: 'local' as const,
};

beforeEach(() => {
  resetServedModelsCache();
  getAvailableModelsForOrganization.mockReset();
});

describe('ThreadModelLabel', () => {
  it('names a route-described local model by its display name, not its id', async () => {
    getAvailableModelsForOrganization.mockResolvedValue([local]);

    render(<ThreadModelLabel model="local-chat" />);

    expect(await screen.findByText('Bielik 11B')).toBeInTheDocument();
    expect(screen.queryByText('local-chat')).not.toBeInTheDocument();
  });

  it('prefers the served name for a catalogue id aliased to a local model', async () => {
    const aliased = availableModels[0]!;
    getAvailableModelsForOrganization.mockResolvedValue([
      { ...local, value: aliased.value },
    ]);

    render(<ThreadModelLabel model={aliased.value} />);

    expect(await screen.findByText('Bielik 11B')).toBeInTheDocument();
  });

  it('falls back to the catalogue label when the served list fails', async () => {
    const entry = availableModels[0]!;
    getAvailableModelsForOrganization.mockRejectedValue(new Error('down'));

    render(<ThreadModelLabel model={entry.value} />);

    expect(await screen.findByText(entry.label)).toBeInTheDocument();
  });

  it('asks the server once per organization for many labels', async () => {
    getAvailableModelsForOrganization.mockResolvedValue([local]);

    render(
      <>
        <ThreadModelLabel model="local-chat" />
        <ThreadModelLabel model="local-chat" />
      </>,
    );

    expect(await screen.findAllByText('Bielik 11B')).toHaveLength(2);
    expect(getAvailableModelsForOrganization).toHaveBeenCalledTimes(1);
  });
});
