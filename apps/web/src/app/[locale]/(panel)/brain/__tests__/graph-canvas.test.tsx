import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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
    cameraStates: Record<string, number>[];
    cameraCalls: string[];
    refreshes: number;
    settings: {
      nodeReducer?: (
        id: string,
        d: Record<string, unknown>,
      ) => Record<string, unknown>;
    };
  }[],
}));
vi.mock('sigma', () => ({
  default: class {
    handlers: Record<string, (e: unknown) => void> = {};
    cameraStates: Record<string, number>[] = [];
    cameraCalls: string[] = [];
    constructor(
      public graph: unknown,
      _container: unknown,
      public settings: Record<string, unknown> = {},
    ) {
      sigma.instances.push(this as never);
    }
    getCamera() {
      const record = (name: string) => async () => {
        this.cameraCalls.push(name);
      };
      return {
        setState: (state: Record<string, number>) =>
          this.cameraStates.push(state),
        animate: record('animate'),
        animatedZoom: record('zoom-in'),
        animatedUnzoom: record('zoom-out'),
        animatedReset: record('fit'),
      };
    }
    getNodeDisplayData() {
      return { x: 0.5, y: 0.5 };
    }
    captorHandlers: Record<string, (e: unknown) => void> = {};
    getMouseCaptor() {
      return {
        on: (event: string, fn: (e: unknown) => void) => {
          this.captorHandlers[event] = fn;
        },
      };
    }
    bbox: unknown = null;
    getCustomBBox() {
      return this.bbox;
    }
    setCustomBBox(box: unknown) {
      this.bbox = box;
    }
    getBBox() {
      return { x: [0, 1], y: [0, 1] };
    }
    viewportToGraph(e: { x: number; y: number }) {
      return { x: e.x / 10, y: e.y / 10 };
    }
    on(event: string, fn: (e: unknown) => void) {
      this.handlers[event] = fn;
    }
    refreshes = 0;
    refresh() {
      this.refreshes += 1;
    }
    kill() {}
  },
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const { BrainGraphCanvas, DRAG_THRESHOLD_PX, ROOMY_GRAPH } =
  await import('../components/BrainGraphCanvas');

const SCOPE = 'org-1:user-1';
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
        <BrainGraphCanvas layoutScope={SCOPE} view={view} />
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
        <BrainGraphCanvas layoutScope={SCOPE} view={view} />
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
        <BrainGraphCanvas layoutScope={SCOPE} view={big} />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(sigma.instances).toHaveLength(2));
    expect(
      (sigma.instances[1]!.graph as G).getNodeAttributes(big.nodes[0]!.id)
        .forceLabel,
    ).toBe(false);
  });

  it('does not force the names of flagged pages in a medium graph', async () => {
    // Forced labels are exempt from Sigma's collision grid; forty of them
    // drew on top of each other. Past SMALL_GRAPH the grid decides, even for
    // a page with an open finding, whose node is still drawn larger.
    const medium = {
      ...view,
      nodes: Array.from({ length: 21 }, (_, i) => ({
        ...view.nodes[0]!,
        id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        title: `Strona ${i}`,
        openFindings: 1,
      })),
      edges: [],
    };
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BrainGraphCanvas layoutScope={SCOPE} view={medium} />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(sigma.instances).toHaveLength(1));
    type G = { getNodeAttributes: (id: string) => { forceLabel: boolean } };
    expect(
      (sigma.instances[0]!.graph as G).getNodeAttributes(medium.nodes[0]!.id)
        .forceLabel,
    ).toBe(false);
  });

  it('takes the height of the window, never less than 600px', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BrainGraphCanvas layoutScope={SCOPE} view={view} />
      </NextIntlClientProvider>,
    );
    const canvas = screen.getByTestId('brain-graph');
    expect(canvas.className).toContain('min-h-[600px]');
    expect(canvas.className).toContain('h-[calc(100svh-15rem)]');
  });

  it('opens a card with the relation’s origin in words and the two links', async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BrainGraphCanvas layoutScope={SCOPE} view={view} />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(sigma.instances).toHaveLength(1));
    act(() => sigma.instances[0]!.handlers.clickNode!({ node: A }));
    const card = await screen.findByTestId('brain-graph-card');
    expect(card).toHaveTextContent('Urlop');
    const relation = screen.getByTestId('brain-graph-relation');
    // The page it points at, the kind with its direction, the origin in words
    // for a screen reader and a tooltip — once, not as a repeated phrase.
    expect(relation).toHaveTextContent('dotyczy →');
    expect(relation).toHaveTextContent('Kadry');
    expect(relation).toHaveTextContent('Uncertain');
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
  // `id % n` gave the group after the last token the first one's colour.
  it('gives the eight groups the legend lists eight different swatches', async () => {
    const { communityColour } = await import('../components/BrainGraphCanvas');
    const swatches = Array.from({ length: 8 }, (_, id) => {
      const { token, alpha } = communityColour(id);
      return `${token}@${alpha}`;
    });
    expect(new Set(swatches).size).toBe(8);
  });

  it('never uses the rationed crimson', async () => {
    const { communityColour } = await import('../components/BrainGraphCanvas');
    for (let id = 0; id < 20; id += 1) {
      expect(communityColour(id).token).not.toBe('--chart-4');
    }
  });

  /**
   * Distinct names are not distinct colours: `--ring` sat beside `--chart-1`
   * and is the same brand blue in both themes, and the test above passed.
   * This one resolves each token through global.css, per theme.
   */
  it('draws with tokens that are different colours in both themes', async () => {
    const { COMMUNITY_TOKENS } = await import('../components/BrainGraphCanvas');
    const css = readFileSync(
      path.resolve(__dirname, '../../../global.css'),
      'utf8',
    );
    const block = (selector: string) => {
      const start = css.indexOf(`${selector} {`);
      return css.slice(start, css.indexOf('\n}', start));
    };
    const declarations = (text: string) =>
      new Map(
        [...text.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [
          m[1]!,
          m[2]!.trim(),
        ]),
      );
    const theme = declarations(css.slice(0, css.indexOf(':root {')));
    for (const selector of [':root', '.dark']) {
      const vars = declarations(block(selector));
      const resolve = (value: string, depth = 0): string => {
        const ref = /^var\((--[\w-]+)\)$/.exec(value);
        if (!ref || depth > 10) {
          return value;
        }
        const next = vars.get(ref[1]!) ?? theme.get(ref[1]!);
        return next ? resolve(next, depth + 1) : value;
      };
      const colours = COMMUNITY_TOKENS.map((token) =>
        resolve(vars.get(token) ?? `missing ${token}`),
      );
      expect(new Set(colours).size, `${selector}: ${colours.join(', ')}`).toBe(
        COMMUNITY_TOKENS.length,
      );
    }
  });
});

describe('BrainGraphCanvas framing', () => {
  const renderView = (v: typeof view) =>
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BrainGraphCanvas layoutScope={SCOPE} view={v} />
      </NextIntlClientProvider>,
    );

  // Sigma fits the camera to nodes, not labels, and labels grow rightwards:
  // the rightmost page's name ran off the canvas ("Zgłaszani…").
  it('leaves room for right-hand labels in a neighbourhood-sized view', async () => {
    renderView(view);
    await waitFor(() => expect(sigma.instances).toHaveLength(1));
    const [state] = sigma.instances[0]!.cameraStates;
    expect(state).toBeDefined();
    expect(state!.ratio).toBeGreaterThan(1);
    expect(state!.x).toBeGreaterThan(0.5);
  });

  // Zoomed out, the whole graph only got smaller and its labels ran together.
  it('keeps the tight fit for a larger graph', async () => {
    const nodes = Array.from({ length: ROOMY_GRAPH + 1 }, (_, i) => ({
      ...view.nodes[1]!,
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      title: `Strona ${i}`,
    }));
    renderView({
      ...view,
      nodes,
      edges: [],
      shown: { nodes: nodes.length, edges: 0 },
      total: { nodes: nodes.length, edges: 0 },
    });
    await waitFor(() => expect(sigma.instances).toHaveLength(1));
    expect(sigma.instances[0]!.cameraStates).toHaveLength(0);
  });
});

describe('BrainGraphCanvas legend', () => {
  // The legend said "thick line", "thinner, amber" in words only. Each entry
  // now shows the line, drawn with the widths and colours the canvas uses.
  it('shows each kind of relation as the line the graph draws', async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BrainGraphCanvas layoutScope={SCOPE} view={view} />
      </NextIntlClientProvider>,
    );
    const legend = await screen.findByTestId('brain-graph-legend');
    const items = legend.querySelectorAll('li');
    expect(items).toHaveLength(4);
    items.forEach((li) => expect(li.querySelector('svg')).not.toBeNull());

    const width = (i: number) =>
      Number(items[i]!.querySelector('line')!.getAttribute('stroke-width'));
    // Stated > uncertain > inferred, as on the canvas.
    expect(width(0)).toBeGreaterThan(width(1));
    expect(width(1)).toBeGreaterThan(width(2));
    // Amber marks the uncertain line.
    expect(items[1]!.querySelector('line')!.getAttribute('stroke')).toBe(
      'var(--chart-3)',
    );
    // The words say only what the line means.
    expect(items[0]).toHaveTextContent(
      messages.brain.graph['legend-extracted'],
    );
    expect(items[0]).not.toHaveTextContent(/thick/i);
  });

  it('finds a page by name, opens its card and flies the camera to it', async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BrainGraphCanvas layoutScope={SCOPE} view={view} />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(sigma.instances).toHaveLength(1));

    fireEvent.change(screen.getByTestId('brain-graph-search'), {
      target: { value: 'kad' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kadry' }));

    expect(screen.getByTestId('brain-graph-card')).toHaveTextContent('Kadry');
    expect(sigma.instances[0]!.cameraCalls).toContain('animate');
    expect(screen.getByTestId('brain-graph-search')).toHaveValue('');
  });

  it('says so when no page matches', async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BrainGraphCanvas layoutScope={SCOPE} view={view} />
      </NextIntlClientProvider>,
    );
    fireEvent.change(screen.getByTestId('brain-graph-search'), {
      target: { value: 'zzz' },
    });
    expect(
      screen.getByText(messages.brain.graph['search-empty']),
    ).toBeInTheDocument();
  });

  it('zooms in, out and back to the whole graph', async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BrainGraphCanvas layoutScope={SCOPE} view={view} />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(sigma.instances).toHaveLength(1));
    const g = messages.brain.graph;
    fireEvent.click(screen.getByRole('button', { name: g['zoom-in'] }));
    fireEvent.click(screen.getByRole('button', { name: g['zoom-out'] }));
    fireEvent.click(screen.getByRole('button', { name: g['zoom-fit'] }));
    expect(sigma.instances[0]!.cameraCalls).toEqual([
      'zoom-in',
      'zoom-out',
      'fit',
    ]);
  });

  it('dims the pages outside a group picked in the legend, and brings them back', async () => {
    const twoGroups = {
      ...view,
      nodes: [
        { ...view.nodes[0]!, community: 0 },
        { ...view.nodes[1]!, community: 1 },
      ],
      communities: [
        { id: 0, size: 2, label: 'Urlop' },
        { id: 1, size: 2, label: 'Kadry' },
      ],
    };
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BrainGraphCanvas layoutScope={SCOPE} view={twoGroups} />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(sigma.instances).toHaveLength(1));
    const reduce = (id: string) =>
      sigma.instances[0]!.settings.nodeReducer!(id, { label: id, color: 'x' });

    const urlop = screen.getByRole('button', { name: /Urlop/ });
    fireEvent.click(urlop);
    expect(urlop).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(reduce(B).label).toBe(''));
    expect(reduce(A).label).toBe(A);

    fireEvent.click(urlop);
    await waitFor(() => expect(reduce(B).label).toBe(B));
  });

  it('keeps a page picked from another group visible while a group filter is on', async () => {
    const twoGroups = {
      ...view,
      nodes: [
        { ...view.nodes[0]!, community: 0 },
        { ...view.nodes[1]!, community: 1 },
      ],
      communities: [
        { id: 0, size: 2, label: 'Urlop' },
        { id: 1, size: 2, label: 'Kadry' },
      ],
    };
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BrainGraphCanvas layoutScope={SCOPE} view={twoGroups} />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(sigma.instances).toHaveLength(1));
    const reduce = (id: string) =>
      sigma.instances[0]!.settings.nodeReducer!(id, { label: id, color: 'x' });

    fireEvent.click(screen.getByRole('button', { name: /Urlop/ }));
    await waitFor(() => expect(reduce(B).label).toBe(''));

    // B is in the other group; picking it from search must not leave the
    // camera on a grey, unnamed dot.
    fireEvent.change(screen.getByTestId('brain-graph-search'), {
      target: { value: 'kad' },
    });
    fireEvent.click(
      within(screen.getByTestId('brain-graph-search-results')).getByRole(
        'button',
        { name: 'Kadry' },
      ),
    );
    await waitFor(() => expect(reduce(B).label).not.toBe(''));
  });
});

describe('dragging a page', () => {
  it('moves the node with the pointer, keeps the camera still, and does not pick it on release', async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BrainGraphCanvas layoutScope={SCOPE} view={view} />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(sigma.instances).toHaveLength(1));
    const s = sigma.instances[0]! as unknown as {
      handlers: Record<string, (e: unknown) => void>;
      captorHandlers: Record<string, (e: unknown) => void>;
      bbox: unknown;
      graph: { getNodeAttribute: (id: string, key: string) => number };
    };
    const preventSigmaDefault = vi.fn();
    const original = { preventDefault: vi.fn(), stopPropagation: vi.fn() };

    act(() =>
      s.handlers.downNode!({
        node: A,
        event: { x: 0, y: 0, original: { button: 0 } },
      }),
    );
    expect(s.bbox).not.toBeNull();
    act(() =>
      s.captorHandlers.mousemovebody!({
        x: 30,
        y: 40,
        preventSigmaDefault,
        original,
      }),
    );
    expect(s.graph.getNodeAttribute(A, 'x')).toBe(3);
    expect(s.graph.getNodeAttribute(A, 'y')).toBe(4);
    expect(preventSigmaDefault).toHaveBeenCalled();

    act(() => s.captorHandlers.mouseup!({}));
    act(() => s.handlers.clickNode!({ node: A }));
    expect(screen.queryByTestId('brain-graph-card')).toBeNull();

    // A plain click, with no drag before it, still picks the page.
    act(() => s.handlers.clickNode!({ node: A }));
    expect(await screen.findByTestId('brain-graph-card')).toBeTruthy();

    // A drag whose release lands on the stage does not close the card.
    act(() =>
      s.handlers.downNode!({
        node: A,
        event: { x: 0, y: 0, original: { button: 0 } },
      }),
    );
    act(() =>
      s.captorHandlers.mousemovebody!({
        x: 50,
        y: 50,
        preventSigmaDefault,
        original,
      }),
    );
    act(() => s.captorHandlers.mouseup!({}));
    act(() => s.handlers.clickStage!({}));
    expect(screen.getByTestId('brain-graph-card')).toBeTruthy();
  });

  it('reads a press that shifts a pixel or two as a click, not a drag', async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BrainGraphCanvas layoutScope={SCOPE} view={view} />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(sigma.instances).toHaveLength(1));
    const s = sigma.instances[0]! as unknown as {
      handlers: Record<string, (e: unknown) => void>;
      captorHandlers: Record<string, (e: unknown) => void>;
      graph: { getNodeAttribute: (id: string, key: string) => number };
    };
    const x = s.graph.getNodeAttribute(A, 'x');
    act(() =>
      s.handlers.downNode!({
        node: A,
        event: { x: 100, y: 100, original: { button: 0 } },
      }),
    );
    act(() =>
      s.captorHandlers.mousemovebody!({
        x: 100 + DRAG_THRESHOLD_PX - 2,
        y: 101,
        preventSigmaDefault: vi.fn(),
        original: { preventDefault: vi.fn(), stopPropagation: vi.fn() },
      }),
    );
    expect(s.graph.getNodeAttribute(A, 'x')).toBe(x);
    act(() => s.captorHandlers.mouseup!({}));
    act(() => s.handlers.clickNode!({ node: A }));
    expect(await screen.findByTestId('brain-graph-card')).toBeTruthy();
  });

  it('does not pick a page up on a right-button press', async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BrainGraphCanvas layoutScope={SCOPE} view={view} />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(sigma.instances.length).toBeGreaterThan(0));
    const s = sigma.instances.at(-1)! as unknown as {
      handlers: Record<string, (e: unknown) => void>;
      captorHandlers: Record<string, (e: unknown) => void>;
      graph: { getNodeAttribute: (id: string, key: string) => number };
    };
    const before = s.graph.getNodeAttribute(A, 'x');
    act(() =>
      s.handlers.downNode!({ node: A, event: { original: { button: 2 } } }),
    );
    act(() =>
      s.captorHandlers.mousemovebody!({
        x: 70,
        y: 70,
        preventSigmaDefault: vi.fn(),
        original: { preventDefault: vi.fn(), stopPropagation: vi.fn() },
      }),
    );
    expect(s.graph.getNodeAttribute(A, 'x')).toBe(before);
  });

  it('moves nothing when the pointer moves without a page held', async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BrainGraphCanvas layoutScope={SCOPE} view={view} />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(sigma.instances).toHaveLength(1));
    const s = sigma.instances.at(-1)! as unknown as {
      captorHandlers: Record<string, (e: unknown) => void>;
      graph: { getNodeAttribute: (id: string, key: string) => number };
    };
    const before = s.graph.getNodeAttribute(A, 'x');
    const preventSigmaDefault = vi.fn();
    act(() =>
      s.captorHandlers.mousemovebody!({
        x: 99,
        y: 99,
        preventSigmaDefault,
        original: {},
      }),
    );
    expect(s.graph.getNodeAttribute(A, 'x')).toBe(before);
    expect(preventSigmaDefault).not.toHaveBeenCalled();
  });
});

describe('a container that changes size', () => {
  it('redraws the graph at the new size, and stops watching on unmount', async () => {
    // Opening the assistant narrows the canvas's container without resizing
    // the window, which is all Sigma listens to on its own.
    const observers: { fire: () => void; disconnected: boolean }[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        disconnected = false;
        constructor(private callback: () => void) {
          observers.push(this as never);
        }
        fire() {
          this.callback();
        }
        observe() {}
        disconnect() {
          this.disconnected = true;
        }
      },
    );
    try {
      const { unmount } = render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <BrainGraphCanvas layoutScope={SCOPE} view={view} />
        </NextIntlClientProvider>,
      );
      await waitFor(() => expect(sigma.instances).toHaveLength(1));
      expect(observers).toHaveLength(1);
      const before = sigma.instances[0]!.refreshes;
      observers[0]!.fire();
      expect(sigma.instances[0]!.refreshes).toBe(before + 1);
      unmount();
      expect(observers[0]!.disconnected).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('the picked page in the address', () => {
  it('opens with the page the address names, and writes each pick back to it', async () => {
    window.history.replaceState(null, '', '/pl/brain/graph?budget=150');
    try {
      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <BrainGraphCanvas layoutScope={SCOPE} view={view} selected={B} />
        </NextIntlClientProvider>,
      );
      expect(await screen.findByTestId('brain-graph-card')).toHaveTextContent(
        'Kadry',
      );
      await waitFor(() => expect(sigma.instances).toHaveLength(1));
      const s = sigma.instances[0]!;

      act(() => s.handlers.clickNode!({ node: A }));
      await waitFor(() =>
        expect(new URL(window.location.href).searchParams.get('selected')).toBe(
          A,
        ),
      );
      // The rest of the address is left as it was.
      expect(new URL(window.location.href).searchParams.get('budget')).toBe(
        '150',
      );

      act(() => s.handlers.clickStage!({}));
      await waitFor(() =>
        expect(new URL(window.location.href).searchParams.has('selected')).toBe(
          false,
        ),
      );
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });

  it('ignores an address naming a page that is not in the view', async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BrainGraphCanvas
          layoutScope={SCOPE}
          view={view}
          selected="00000000-0000-4000-8000-0000000000ff"
        />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(sigma.instances).toHaveLength(1));
    expect(screen.queryByTestId('brain-graph-card')).toBeNull();
  });

  it('writes nothing while the address is not the graph’s', async () => {
    window.history.replaceState(null, '', `/pl/brain/pages/${B}`);
    try {
      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <BrainGraphCanvas layoutScope={SCOPE} view={view} />
        </NextIntlClientProvider>,
      );
      await waitFor(() => expect(sigma.instances).toHaveLength(1));
      act(() => sigma.instances[0]!.handlers.clickNode!({ node: A }));
      expect(await screen.findByTestId('brain-graph-card')).toBeTruthy();
      expect(window.location.search).toBe('');
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });
});

describe('a layout arranged by hand', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  type G = {
    getNodeAttribute: (id: string, name: string) => unknown;
  };

  it('comes back where it was left, and only the new pages are laid out', async () => {
    const { saveLayout, viewKey } = await import('../components/graph-layouts');
    // B is new since the layout was saved.
    saveLayout(viewKey(view, SCOPE), { [A]: { x: 42, y: -7 } });
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BrainGraphCanvas layoutScope={SCOPE} view={view} />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(sigma.instances).toHaveLength(1));
    const graph = sigma.instances[0]!.graph as G;
    expect(graph.getNodeAttribute(A, 'x')).toBe(42);
    expect(graph.getNodeAttribute(A, 'y')).toBe(-7);
    expect(graph.getNodeAttribute(A, 'fixed')).toBe(true);
    expect(graph.getNodeAttribute(B, 'fixed')).toBeUndefined();
    expect(
      await screen.findByTestId('brain-graph-reset-layout'),
    ).toHaveAccessibleName('Restore the automatic layout');
  });

  it('is saved whole when a page is dropped, and not on a click', async () => {
    const { loadLayout, viewKey } = await import('../components/graph-layouts');
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BrainGraphCanvas layoutScope={SCOPE} view={view} />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(sigma.instances).toHaveLength(1));
    const s = sigma.instances[0]! as unknown as {
      handlers: Record<string, (e: unknown) => void>;
      captorHandlers: Record<string, (e: unknown) => void>;
      graph: G;
    };
    expect(screen.queryByTestId('brain-graph-reset-layout')).toBeNull();

    // A click is not a move.
    act(() =>
      s.handlers.downNode!({
        node: B,
        event: { x: 0, y: 0, original: { button: 0 } },
      }),
    );
    act(() => s.captorHandlers.mouseup!({}));
    expect(loadLayout(viewKey(view, SCOPE))).toEqual({});

    act(() =>
      s.handlers.downNode!({
        node: A,
        event: { x: 0, y: 0, original: { button: 0 } },
      }),
    );
    act(() =>
      s.captorHandlers.mousemovebody!({
        x: 30,
        y: 40,
        preventSigmaDefault: vi.fn(),
        original: { preventDefault: vi.fn(), stopPropagation: vi.fn() },
      }),
    );
    act(() => s.captorHandlers.mouseup!({}));

    const saved = loadLayout(viewKey(view, SCOPE));
    // The dropped page where it was dropped, and the rest where they stand.
    expect(saved[A]).toEqual({ x: 3, y: 4 });
    expect(saved[B]).toEqual({
      x: Math.round((s.graph.getNodeAttribute(B, 'x') as number) * 1e4) / 1e4,
      y: Math.round((s.graph.getNodeAttribute(B, 'y') as number) * 1e4) / 1e4,
    });
    expect(await screen.findByTestId('brain-graph-reset-layout')).toBeVisible();
  });

  it('is forgotten by restoring the layout, which lays the view out again', async () => {
    const { loadLayout, saveLayout, viewKey } =
      await import('../components/graph-layouts');
    saveLayout(viewKey(view, SCOPE), { [A]: { x: 42, y: -7 } });
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BrainGraphCanvas layoutScope={SCOPE} view={view} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(await screen.findByTestId('brain-graph-reset-layout'));

    await waitFor(() => expect(sigma.instances).toHaveLength(2));
    expect(loadLayout(viewKey(view, SCOPE))).toEqual({});
    expect(
      (sigma.instances[1]!.graph as G).getNodeAttribute(A, 'fixed'),
    ).toBeUndefined();
    await waitFor(() =>
      expect(screen.queryByTestId('brain-graph-reset-layout')).toBeNull(),
    );
  });

  it('of one operator or organization stays out of another', async () => {
    const { saveLayout, viewKey } = await import('../components/graph-layouts');
    saveLayout(viewKey(view, 'org-2:user-1'), { [A]: { x: 42, y: -7 } });
    saveLayout(viewKey(view, 'org-1:user-2'), { [A]: { x: 42, y: -7 } });
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BrainGraphCanvas layoutScope={SCOPE} view={view} />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(sigma.instances).toHaveLength(1));
    expect(
      (sigma.instances[0]!.graph as G).getNodeAttribute(A, 'fixed'),
    ).toBeUndefined();
  });

  it('of one view stays out of another', async () => {
    const { saveLayout, viewKey } = await import('../components/graph-layouts');
    saveLayout(viewKey({ ...view, budget: 300 }, SCOPE), {
      [A]: { x: 42, y: -7 },
    });
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BrainGraphCanvas layoutScope={SCOPE} view={view} />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(sigma.instances).toHaveLength(1));
    expect(
      (sigma.instances[0]!.graph as G).getNodeAttribute(A, 'fixed'),
    ).toBeUndefined();
  });
});

describe('the card in Polish', () => {
  it('says the relation’s kind in Polish, and marks both links with an icon', async () => {
    const pl = (await import('@/app/messages/pl.json')).default;
    render(
      <NextIntlClientProvider locale="pl" messages={pl}>
        <BrainGraphCanvas
          layoutScope={SCOPE}
          view={{
            ...view,
            focus: A,
            edges: [{ ...view.edges[0]!, kind: 'applies to' }],
          }}
        />
      </NextIntlClientProvider>,
    );
    const row = await screen.findByTestId('brain-graph-relation');
    expect(row).toHaveTextContent('dotyczy →');
    expect(row).not.toHaveTextContent('applies to');
    const card = screen.getByTestId('brain-graph-card');
    for (const name of ['Otwórz stronę', 'Pokaż sąsiedztwo']) {
      const link = within(card).getByRole('link', { name });
      expect(link.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    }
  });
});
