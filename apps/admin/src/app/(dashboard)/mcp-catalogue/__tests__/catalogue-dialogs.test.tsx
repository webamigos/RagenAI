// @vitest-environment jsdom
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Editing and adding a catalogue entry happen in a dialog, not in a form
 * unfolding inside the table's actions cell — where a dozen fields read as
 * one narrow ribbon beside rows that no longer line up.
 */

vi.mock('../actions', () => ({
  deleteCatalogueEntryAction: vi.fn(),
  setCatalogueEntryEnabledAction: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// The form is its own suite's; here it only has to be there, and close.
vi.mock('../components/CatalogueEntryForm', () => ({
  CatalogueEntryForm: ({
    entry,
    onDone,
  }: {
    entry?: { label: string };
    onDone?: () => void;
  }) => (
    <form aria-label="catalogue entry">
      <span>{entry ? `editing ${entry.label}` : 'new entry'}</span>
      <button type="button" onClick={onDone}>
        Cancel
      </button>
    </form>
  ),
}));

const { CatalogueRowActions } =
  await import('../components/CatalogueRowActions');
const { AddCatalogueEntryButton } =
  await import('../components/AddCatalogueEntryButton');

const entry = {
  slug: 'rejestrio',
  label: 'Rejestr.io',
  description: '',
  mcpServerUrl: 'http://ragen-mcp-rejestrio.railway.internal:9080/mcp',
  authType: 'SERVER_SIDE',
} as never;

beforeEach(() => vi.clearAllMocks());

describe('the catalogue row', () => {
  it('opens the edit form in a dialog named for the entry, and closes it on cancel', async () => {
    render(
      <CatalogueRowActions
        publicId="p-1"
        slug="rejestrio"
        enabled
        isBuiltIn={false}
        entry={entry}
      />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Rejestr.io' });
    expect(within(dialog).getByText('editing Rejestr.io')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    // Focus goes back to the row's own Edit button, not to the top of the page.
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Edit' }),
      ),
    );
  });

  it('offers no edit for a built-in entry', () => {
    render(
      <CatalogueRowActions
        publicId="p-1"
        slug="clickup"
        enabled
        isBuiltIn
        entry={entry}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });
});

describe('Add a connector', () => {
  it('opens an empty form in the same dialog', () => {
    render(<AddCatalogueEntryButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a connector' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a connector' });
    expect(within(dialog).getByText('new entry')).toBeTruthy();
  });
});
