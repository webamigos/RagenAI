import { act, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '@/app/messages/en.json';

/**
 * jsdom has no WebGL, so sigma is replaced by a double that records the
 * graph it was handed and lets the test fire its events. What this pins is
 * the wiring: every node and edge reaches the renderer, the origin sets the
 * edge width, and a click opens the node's card.
 */
const sigma = vi.hoisted(() => ({
  instances: [] as {
    graph: unknown;
    handlers: Record<string, (e: unknown) => void>;
  }[],
}));
vi.mock('sigma', () => ({
  default: class {
    handlers: Record<string, (e: unknown) => void> = {};
    constructor(public graph: unknown) {
      sigma.instances.push(this as never);
    }
    on(event: string, fn: (e: unknown) => void) {
      this.handlers[event] = fn;
    }
    refresh() {}
    kill() {}
  },
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const { BrainGraphCanvas } = await import('../components/BrainGraphCanvas');

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const view = {
  nodes: [
    {
      id: A,
      title: 'Urlop',
      type: 'POLICY' as const,
      status: 'APPROVED' as const,
      community: 0,
      degree: 1,
      openFindings: 1,
    },
    {
      id: B,
      title: 'Kadry',
      type: 'ENTITY' as const,
      status: 'CANDIDATE' as const,
      community: 0,
      degree: 1,
      openFindings: 0,
    },
  ],
  edges: [
    {
      from: A,
      to: B,
      kind: 'dotyczy',
      origin: 'AMBIGUOUS' as const,
      confidence: null,
    },
  ],
  communities: [{ id: 0, size: 2, label: 'Urlop' }],
  shown: { nodes: 2, edges: 1 },
  total: { nodes: 2, edges: 1 },
  hiddenInferred: 0,
  inferred: 0,
  focus: null,
  budget: 150,
  budgets: [150, 300, 600, 1000],
  hops: 1 as const,
  includeInferred: false,
};

beforeEach(() => {
  sigma.instances.length = 0;
});

describe('BrainGraphCanvas', () => {
  it('hands the renderer every node and edge, sized by origin and findings', async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BrainGraphCanvas view={view} />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(sigma.instances).toHaveLength(1));
    const graph = sigma.instances[0]!.graph as {
      order: number;
      size: number;
      getNodeAttributes: (id: string) => { size: number; forceLabel: boolean };
      forEachEdge: (fn: (e: string, a: { size: number }) => void) => void;
    };
    expect(graph.order).toBe(2);
    expect(graph.size).toBe(1);
    expect(graph.getNodeAttributes(A).forceLabel).toBe(true);
    expect(graph.getNodeAttributes(A).size).toBeGreaterThan(
      graph.getNodeAttributes(B).size,
    );
    graph.forEachEdge((_, attrs) => expect(attrs.size).toBe(1));
    expect(
      screen.getByText('Click a page to see its relations.'),
    ).toBeVisible();
  });

  it('names every page of a small graph, and only the flagged ones of a large one', async () => {
    const big = {
      ...view,
      nodes: Array.from({ length: 61 }, (_, i) => ({
        ...view.nodes[1]!,
        id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        title: `Strona ${i}`,
      })),
      edges: [],
    };
    const { unmount } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BrainGraphCanvas view={view} />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(sigma.instances).toHaveLength(1));
    type G = { getNodeAttributes: (id: string) => { forceLabel: boolean } };
    // B has no open finding, and is named anyway: the graph is small.
    expect(
      (sigma.instances[0]!.graph as G).getNodeAttributes(B).forceLabel,
    ).toBe(true);
    unmount();
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BrainGraphCanvas view={big} />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(sigma.instances).toHaveLength(2));
    expect(
      (sigma.instances[1]!.graph as G).getNodeAttributes(big.nodes[0]!.id)
        .forceLabel,
    ).toBe(false);
  });

  it('opens a card with the relation’s origin in words and the two links', async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BrainGraphCanvas view={view} />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(sigma.instances).toHaveLength(1));
    act(() => sigma.instances[0]!.handlers.clickNode!({ node: A }));
    const card = await screen.findByTestId('brain-graph-card');
    expect(card).toHaveTextContent('Urlop');
    expect(card).toHaveTextContent('dotyczy · Kadry · Uncertain');
    expect(screen.getByRole('link', { name: 'Open page' })).toHaveAttribute(
      'href',
      `/brain/pages/${A}`,
    );
    expect(
      screen.getByRole('link', { name: 'Show neighbourhood' }),
    ).toHaveAttribute('href', `/brain/graph?focus=${A}&budget=150`);
  });
});

describe('communityColour', () => {
  // Five tokens and `id % 5` gave the sixth community the first one's colour.
  it('gives the first ten communities ten different swatches', async () => {
    const { communityColour } = await import('../components/BrainGraphCanvas');
    const swatches = Array.from({ length: 10 }, (_, id) => {
      const { token, alpha } = communityColour(id);
      return `${token}@${alpha}`;
    });
    expect(new Set(swatches).size).toBe(10);
  });

  it('never uses the rationed crimson', async () => {
    const { communityColour } = await import('../components/BrainGraphCanvas');
    for (let id = 0; id < 20; id += 1) {
      expect(communityColour(id).token).not.toBe('--chart-4');
    }
  });
});
