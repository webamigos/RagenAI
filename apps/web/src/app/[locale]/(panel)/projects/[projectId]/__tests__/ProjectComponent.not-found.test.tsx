import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

import messages from '@/app/messages/pl.json';

// Everything the component reaches for before the project exists. The point
// of the test is what renders when the project never arrives, so none of
// these ever resolve anything meaningful.
vi.mock('@/app/lib/services/api', () => ({
  fetchProject: vi.fn().mockRejectedValue(new Error('404')),
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/app/hooks/useClientOnly', () => ({ useClientOnly: () => true }));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
const errorToast = vi.fn();
vi.mock('@/app/lib/utils/toast', () => ({
  statusToast: () => ({
    errorToast,
    successToast: vi.fn(),
    infoToast: vi.fn(),
  }),
}));
vi.mock('@/app/actions', () => ({
  getProjectStorageInfo: vi.fn(),
  deleteProjectFileAction: vi.fn(),
  importFilesToProject: vi.fn(),
}));
vi.mock('@/app/actions/google-drive', () => ({
  isDriveConnected: vi.fn().mockResolvedValue(false),
  syncDriveFiles: vi.fn(),
  hasDriveFilesInProject: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/app/actions/fireflies', () => ({
  isFirefliesConnected: vi.fn().mockResolvedValue(false),
}));
vi.mock(
  '@/features/documents/services/queries/get-project-files-query',
  () => ({
    getProjectFilesQuery: vi.fn(),
  }),
);
vi.mock('@/app/components/Sidebar/Projects/actions', () => ({
  starProjectAction: vi.fn(),
}));
vi.mock('@/app/components/Projects/ProjectInstructions/actions', () => ({
  getProjectInstructionAction: vi.fn(),
}));
vi.mock('@/app/components/ChatInterface', () => ({
  ChatInterface: () => null,
}));

import { ProjectComponent } from '../ProjectComponent';

describe('ProjectComponent — an assistant that does not load', () => {
  it('says so instead of a skeleton that never resolves', async () => {
    render(
      <NextIntlClientProvider locale="pl" messages={messages}>
        <ProjectComponent projectId="00000000-0000-0000-0000-000000000000" />
      </NextIntlClientProvider>,
    );

    expect(
      await screen.findByText(messages.projects.error['not-found']),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: messages.projects['project-view']['all-projects'],
      }),
    ).toHaveAttribute('href', '/projects');
    // Not the old toast, which blamed "the assistant's files".
    expect(errorToast).not.toHaveBeenCalled();
  });
});
