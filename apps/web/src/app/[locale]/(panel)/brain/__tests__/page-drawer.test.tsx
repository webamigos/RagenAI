import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '@/app/messages/en.json';

const back = vi.fn();
vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ back }),
}));

const { DrawerClosed, PageDrawer, PageDrawerHost } =
  await import('../components/PageDrawer');

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

/** The graph layout's slot: a drawer for `page`, or the empty slot. */
function Slot({ page }: { page: string | null }) {
  return (
    <NextIntlClientProvider locale="pl" messages={messages}>
      <PageDrawerHost>
        {page ? (
          // Keyed like the route segment: each page is a fresh drawer.
          <PageDrawer key={page} pageId={page}>
            <p>{page}</p>
          </PageDrawer>
        ) : (
          <DrawerClosed />
        )}
      </PageDrawerHost>
    </NextIntlClientProvider>
  );
}

let go: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  back.mockReset();
  go = vi.spyOn(window.history, 'go').mockImplementation(() => {});
});
afterEach(() => {
  go.mockRestore();
});

describe('PageDrawer', () => {
  it('shows the page, takes focus, and links the full page past the interception', () => {
    render(<Slot page={A} />);
    const drawer = screen.getByTestId('brain-page-drawer');
    expect(drawer).toHaveTextContent(A);
    expect(drawer).toHaveFocus();
    // An anchor, not the router's Link: that would open this drawer again.
    expect(screen.getByTestId('brain-page-drawer-full')).toHaveAttribute(
      'href',
      `/pl/brain/pages/${A}`,
    );
  });

  it('closes back to the graph in one step', () => {
    render(<Slot page={A} />);
    fireEvent.click(screen.getByTestId('brain-page-drawer-close'));
    expect(back).toHaveBeenCalledTimes(1);
    expect(go).not.toHaveBeenCalled();
  });

  it('closes past every page followed inside it, not just the last one', () => {
    const { rerender } = render(<Slot page={A} />);
    rerender(<Slot page={B} />);
    fireEvent.click(screen.getByTestId('brain-page-drawer-close'));
    expect(go).toHaveBeenCalledWith(-2);
    expect(back).not.toHaveBeenCalled();
  });

  it('reads browser back to the previous page as going back, not as a third page', () => {
    const { rerender } = render(<Slot page={A} />);
    rerender(<Slot page={B} />);
    rerender(<Slot page={A} />);
    fireEvent.click(screen.getByTestId('brain-page-drawer-close'));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('starts a new trail once the slot has gone empty', () => {
    const { rerender } = render(<Slot page={A} />);
    rerender(<Slot page={B} />);
    rerender(<Slot page={null} />);
    rerender(<Slot page={B} />);
    fireEvent.click(screen.getByTestId('brain-page-drawer-close'));
    expect(back).toHaveBeenCalledTimes(1);
    expect(go).not.toHaveBeenCalled();
  });

  it('closes on Escape from inside it, but not on one that something inside already handled', () => {
    render(<Slot page={A} />);
    const drawer = screen.getByTestId('brain-page-drawer');
    const inner = screen.getByText(A);
    inner.addEventListener('keydown', (e) => e.preventDefault(), {
      once: true,
    });
    fireEvent.keyDown(inner, { key: 'Escape' });
    expect(back).not.toHaveBeenCalled();
    fireEvent.keyDown(drawer, { key: 'Escape' });
    expect(back).toHaveBeenCalledTimes(1);
  });
});
