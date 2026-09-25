import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { BrainScreenContext } from '@/features/brain-assistant/contracts/brain-assistant.types';

import {
  BrainScreen,
  BrainScreenProvider,
  useBrainScreen,
} from '../components/assistant/BrainAssistantContext';

const PAGE = '00000000-0000-4000-8000-000000000001';
const graph: BrainScreenContext = { view: 'graph' };
const page: BrainScreenContext = { view: 'page', pageId: PAGE };

function Shown() {
  return <p data-testid="shown">{JSON.stringify(useBrainScreen())}</p>;
}

function Tree({ drawer }: { drawer: boolean }) {
  return (
    <BrainScreenProvider>
      <BrainScreen context={graph} />
      {drawer && <BrainScreen context={page} />}
      <Shown />
    </BrainScreenProvider>
  );
}

describe('BrainScreen', () => {
  it('tells the panel about the page in the drawer, and hands the graph back when it closes', () => {
    const { rerender } = render(<Tree drawer={false} />);
    expect(screen.getByTestId('shown')).toHaveTextContent('"view":"graph"');

    rerender(<Tree drawer />);
    expect(screen.getByTestId('shown')).toHaveTextContent(PAGE);

    // The graph's own <BrainScreen> did not change and says nothing again;
    // without the stack the panel would still be describing the closed page.
    rerender(<Tree drawer={false} />);
    expect(screen.getByTestId('shown')).toHaveTextContent('"view":"graph"');
  });

  it('keeps a screen in its place when what it shows changes', () => {
    const { rerender } = render(
      <BrainScreenProvider>
        <BrainScreen context={graph} />
        <BrainScreen context={page} />
        <Shown />
      </BrainScreenProvider>,
    );
    // The graph under the drawer picks another page: the drawer stays on top.
    rerender(
      <BrainScreenProvider>
        <BrainScreen context={{ view: 'graph', selectedPageId: PAGE }} />
        <BrainScreen context={page} />
        <Shown />
      </BrainScreenProvider>,
    );
    expect(screen.getByTestId('shown')).toHaveTextContent('"view":"page"');
  });
});
