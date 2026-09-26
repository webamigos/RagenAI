import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

import { ToolbarActions } from '../ToolbarActions';
import messages from '@/app/messages/en.json';
import { OrgFeaturesProvider } from '@/context/OrgFeaturesContext';
import { DEFAULT_FEATURES } from '@/features/subscriptions/contracts/features.types';

vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

function show(props: Partial<React.ComponentProps<typeof ToolbarActions>>) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ToolbarActions
        fileId="file-1"
        fileName="umowa.pdf"
        toggleModal={vi.fn()}
        isLoading={false}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

const deleteLabel = messages['files-table'].delete;

describe('ToolbarActions', () => {
  it('names the menu after the file, in the reader’s language', () => {
    // It said "Actions" in every locale, and the same for every row.
    show({});

    expect(
      screen.getByRole('button', { name: 'Actions for umowa.pdf' }),
    ).toBeInTheDocument();
  });

  it('offers delete by default', async () => {
    show({});
    await userEvent.click(screen.getByRole('button', { name: /Actions for/ }));

    expect(
      await screen.findByRole('menuitem', { name: deleteLabel }),
    ).toBeInTheDocument();
  });

  it('offers no delete where documents may not be removed', async () => {
    show({ canDelete: false });
    await userEvent.click(screen.getByRole('button', { name: /Actions for/ }));

    // The menu is open — it still has its other items.
    expect(await screen.findAllByRole('menuitem')).not.toHaveLength(0);
    expect(
      screen.queryByRole('menuitem', { name: deleteLabel }),
    ).not.toBeInTheDocument();
  });

  describe('Score for RAG', () => {
    const scoreLabel = messages['files-table']['score-rag'];

    function showWithScoring(ragReadinessScore: boolean) {
      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <OrgFeaturesProvider
            features={{ ...DEFAULT_FEATURES, ragReadinessScore }}
          >
            <ToolbarActions
              fileId="file-1"
              fileName="umowa.pdf"
              toggleModal={vi.fn()}
              isLoading={false}
              onScore={vi.fn()}
            />
          </OrgFeaturesProvider>
        </NextIntlClientProvider>,
      );
    }

    it('is offered where the organization scores documents', async () => {
      showWithScoring(true);
      await userEvent.click(
        screen.getByRole('button', { name: /Actions for/ }),
      );

      expect(
        await screen.findByRole('menuitem', { name: scoreLabel }),
      ).toBeInTheDocument();
    });

    // `ragReadinessScore` off in apps/admin: the command would refuse, so the
    // menu does not offer it.
    it('is not offered where scoring is turned off', async () => {
      showWithScoring(false);
      await userEvent.click(
        screen.getByRole('button', { name: /Actions for/ }),
      );

      expect(await screen.findAllByRole('menuitem')).not.toHaveLength(0);
      expect(
        screen.queryByRole('menuitem', { name: scoreLabel }),
      ).not.toBeInTheDocument();
    });
  });
});
