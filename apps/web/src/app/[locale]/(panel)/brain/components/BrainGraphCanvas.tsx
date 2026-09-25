'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowsPointingOutIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
} from '@heroicons/react/24/outline';
import type Sigma from 'sigma';

import type { BrainGraphView } from '@/features/brain/contracts/brain-graph.types';
import { Link } from '@/i18n/routing';
import { makeDrawNodeHover } from './graph-hover';
import { canvasLabel, LABEL_SIZE_PX, separateLabels } from './separate-labels';
import { BrainScreen } from './assistant/BrainAssistantContext';

type Node = BrainGraphView['nodes'][number];

/**
 * The tokens a community is drawn in, by `community % length`. Not
 * `--chart-4`: that is the signal crimson, rationed to destructive actions
 * and what is wrong (`docs/panel-ux-rules.md` rule 16), and a group of pages
 * is neither.
 */
const COMMUNITY_TOKENS = [
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--ring',
  '--chart-5',
] as const;

/**
 * A community's colour: a token, and how opaque to draw it.
 *
 * Five tokens and a plain `id % 5` gave the sixth community the first one's
 * colour, so two unrelated groups read as one. The second lap draws the same
 * tokens mixed half-and-half with the background — ten distinct swatches
 * before anything repeats, without borrowing the rationed crimson. Past ten
 * the cycle wraps; the legend lists at most eight.
 *
 * Mixed to an opaque colour, not drawn at half opacity: Sigma composites with
 * `ONE, ONE_MINUS_SRC_ALPHA`, which expects premultiplied colour, and it does
 * not premultiply what it is given — a translucent node came out brighter
 * than the legend's swatch for the same community. `alpha` here is the share
 * of the token in the mix.
 */
export function communityColour(id: number): {
  token: (typeof COMMUNITY_TOKENS)[number];
  alpha: number;
} {
  const n = COMMUNITY_TOKENS.length;
  const slot = ((id % (n * 2)) + n * 2) % (n * 2);
  return { token: COMMUNITY_TOKENS[slot % n], alpha: slot < n ? 1 : 0.5 };
}

/**
 * Up to this many pages, every page is labelled.
 *
 * Was 60. A forced label is exempt from Sigma's collision grid, so forty-odd
 * forced names drew on top of each other in the middle of the graph. Past
 * this size the grid decides, and a hidden name appears on hover or zoom.
 */
const SMALL_GRAPH = 20;

/** Up to this many pages the layout is spread for legibility (see `scalingRatio`). */
const MEDIUM_GRAPH = 200;

/** Up to this many pages, the layout spreads out and the camera leaves label room. */
export const ROOMY_GRAPH = 15;

/** ForceAtlas2's `scalingRatio` for a graph of `order` pages. */
function spreadFor(
  order: number,
  roomy: boolean,
  inferred: number | undefined,
): number | undefined {
  if (roomy) {
    return Math.max(inferred ?? 1, 12);
  }
  if (order <= MEDIUM_GRAPH) {
    return Math.max(inferred ?? 1, 10);
  }
  return inferred;
}

/** Width carries the origin too, so it is never told by colour alone. */
const EDGE_SIZE = { EXTRACTED: 1.6, AMBIGUOUS: 1, INFERRED: 0.6 } as const;

/**
 * How each kind of relation is drawn — the canvas and the legend's swatches
 * both read this, so the legend cannot describe a line the graph no longer
 * draws.
 */
const EDGE_STYLE = {
  EXTRACTED: { token: '--muted-foreground', alpha: 0.7 },
  AMBIGUOUS: { token: '--chart-3', alpha: 0.8 },
  INFERRED: { token: '--muted-foreground', alpha: 0.3 },
} as const;

type EdgeOrigin = keyof typeof EDGE_SIZE;

/**
 * A short line drawn the way the graph draws `origin`. The widths are the
 * canvas's, scaled up so a 0.6 line is still visible at legend size.
 */
function EdgeSwatch({ origin }: { origin: EdgeOrigin }) {
  const { token, alpha } = EDGE_STYLE[origin];
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 28 10"
      className="mt-1 h-2.5 w-7 shrink-0"
    >
      <line
        x1="1"
        y1="5"
        x2="27"
        y2="5"
        stroke={`var(${token})`}
        strokeOpacity={alpha}
        strokeWidth={EDGE_SIZE[origin] * 2}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** An ordinary page beside a larger one — the size a finding gives a page. Neutral grey: colour on the canvas means the community, and the swatch is about size. */
function FindingSwatch() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 28 10"
      className="mt-1 h-2.5 w-7 shrink-0"
    >
      <circle cx="6" cy="5" r="2.5" fill="var(--muted-foreground)" />
      <circle cx="18" cy="5" r="4.5" fill="var(--muted-foreground)" />
    </svg>
  );
}

/**
 * The graph itself (spec D4), drawn with sigma on WebGL over graphology.
 *
 * - **Colour is the community** (Louvain, from `assembleGraph`), taken from
 *   the chart tokens and resolved to RGB in the browser — the tokens are
 *   oklch, which sigma's WebGL cannot parse, and the panel's colours stay
 *   tokens rather than hex.
 * - **An edge's origin is never colour alone**: EXTRACTED is drawn full
 *   width, AMBIGUOUS thinner in the pending tone, INFERRED thinnest and
 *   faint — and hidden unless the URL asks for it. The legend names all
 *   three, and a node's card lists its relations with their origin in words.
 * - **Pages with open findings are larger and always labelled.**
 * - Hover dims everything but the node's neighbourhood; a click opens its
 *   card, from which the page or its neighbourhood is one link away.
 *
 * Sigma is loaded on the client only: it needs WebGL and `window`.
 */
export function BrainGraphCanvas({ view }: { view: BrainGraphView }) {
  const t = useTranslations('brain.graph');
  const container = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Node | null>(
    () => view.nodes.find((n) => n.id === view.focus) ?? null,
  );
  const [failed, setFailed] = useState(false);
  const renderer = useRef<Sigma | null>(null);
  // Read by the reducers inside the effect, which outlive a render; a state
  // change pokes the renderer to redraw rather than rebuilding the graph.
  const selectedId = useRef<string | null>(selected?.id ?? null);
  const [communityFilter, setCommunityFilter] = useState<number | null>(null);
  const filterRef = useRef<number | null>(null);
  const [query, setQuery] = useState('');

  // A new view is a new picture: the card follows the focus, or closes.
  // Adjusted while rendering, as React recommends for state derived from a
  // prop, rather than in an effect that would render twice.
  const [shownView, setShownView] = useState(view);
  if (shownView !== view) {
    setShownView(view);
    setSelected(view.nodes.find((n) => n.id === view.focus) ?? null);
    setCommunityFilter(null);
  }

  useEffect(() => {
    selectedId.current = selected?.id ?? null;
    filterRef.current = communityFilter;
    renderer.current?.refresh();
  }, [selected, communityFilter]);

  useEffect(() => {
    let disposed = false;
    let kill: (() => void) | undefined;
    (async () => {
      try {
        const [{ default: Sigma }, { MultiDirectedGraph }, fa2] =
          await Promise.all([
            import('sigma'),
            import('graphology'),
            import('graphology-layout-forceatlas2'),
          ]);
        if (disposed || !container.current) {
          return;
        }
        const palette = tokenColours(container.current);
        const graph = new MultiDirectedGraph();
        // A small graph is read page by page, so every page is named; the
        // size threshold that keeps a thousand labels apart would otherwise
        // leave a handful of unconnected pages as unnamed dots.
        const labelAll = view.nodes.length <= SMALL_GRAPH;
        // A neighbourhood-sized view: few enough pages that spreading them out
        // and leaving room for the right-hand labels costs nothing. Past this
        // the whole graph needs the space, and zooming out only shrinks it.
        const roomy = view.nodes.length <= ROOMY_GRAPH;
        const communities = Math.max(1, view.communities.length);
        view.nodes.forEach((node, i) => {
          // Start each community on its own arc, so the layout settles into
          // clusters instead of untangling one ball.
          const angle =
            (2 * Math.PI * node.community) / communities + i * 0.001;
          const radius = 10 + (i % 7);
          graph.addNode(node.id, {
            x: Math.cos(angle) * radius + (i % 3),
            y: Math.sin(angle) * radius + (i % 5),
            size:
              6 + Math.sqrt(node.degree) * 2 + (node.openFindings > 0 ? 4 : 0),
            // Shortened on the canvas so forty names fit; the whole title is
            // `title`, shown on hover, in the card and in search.
            label: canvasLabel(node.title),
            title: node.title,
            color: palette.community(node.community),
            community: node.community,
            // An open finding is marked by the node's size and ring; forcing
            // its name too put a dozen unmovable labels in the densest part
            // of a medium graph. Its name shows on hover like any other.
            forceLabel:
              labelAll ||
              node.id === view.focus ||
              (node.openFindings > 0 && view.nodes.length <= SMALL_GRAPH),
          });
        });
        for (const edge of view.edges) {
          if (!graph.hasNode(edge.from) || !graph.hasNode(edge.to)) {
            continue;
          }
          graph.addEdge(edge.from, edge.to, {
            size: EDGE_SIZE[edge.origin],
            color: palette.edge[edge.origin],
            label: edge.kind,
          });
        }
        if (graph.order > 1) {
          const inferred = fa2.default.inferSettings(graph);
          fa2.default.assign(graph, {
            iterations: graph.order > 600 ? 80 : 150,
            settings: {
              ...inferred,
              // Nodes repel by their drawn size, not as points, so two pages
              // never sit on top of each other with their labels crossed.
              adjustSizes: true,
              // The inferred ratio suits thousands of nodes and packs a graph
              // that is read by name too tight. See `spreadFor`.
              scalingRatio: spreadFor(
                graph.order,
                roomy,
                inferred.scalingRatio,
              ),
            },
          });
          // ForceAtlas2 keeps the dots apart; this keeps the names apart.
          // Past MEDIUM_GRAPH most names are hidden by the label grid anyway,
          // and the pass would cost more than it shows.
          if (graph.order <= MEDIUM_GRAPH) {
            // Quadratic per pass and run before the first frame. A dense graph
            // near MEDIUM_GRAPH could spend the full budget colliding (~48M
            // pair checks), so past 80 pages it gets a smaller one; what
            // overlap remains is left to Sigma's label grid.
            separateLabels(
              graph,
              {
                width: container.current.clientWidth,
                height: container.current.clientHeight,
              },
              graph.order > 80 ? { rounds: 4, iterations: 60 } : undefined,
            );
          }
        }

        let hovered: string | null = null;
        // Hover wins; otherwise the page picked by a click or a search stays
        // lit with its neighbours, and a picked group dims the rest.
        const emphasised = () => hovered ?? selectedId.current;
        const sigmaRenderer = new Sigma(graph, container.current, {
          renderEdgeLabels: false,
          // Room for the labels of nodes laid out on the edge of the stage.
          stagePadding: 60,
          labelRenderedSizeThreshold: 8,
          labelSize: LABEL_SIZE_PX,
          // Denser than the default grid would hide: a label is the only way
          // to tell pages apart, so keep as many as fit without touching.
          labelDensity: 1.2,
          labelGridCellSize: 90,
          labelColor: { color: palette.label },
          // Sigma's default hover box is white whatever the theme — see
          // `makeDrawNodeHover`.
          defaultDrawNodeHover: makeDrawNodeHover({
            surface: palette.surface,
            border: palette.border,
            text: palette.label,
          }),
          nodeReducer: (id, data) => {
            const filter = filterRef.current;
            const focus = emphasised();
            // The page just picked — by search, from another group — stays
            // visible and named; otherwise the camera landed on a grey dot.
            if (
              filter !== null &&
              id !== focus &&
              graph.getNodeAttribute(id, 'community') !== filter
            ) {
              return { ...data, color: palette.dim, label: '' };
            }
            if (!focus || id === focus || graph.areNeighbors(id, focus)) {
              // The page under the cursor or picked is named in full.
              return focus === id
                ? {
                    ...data,
                    forceLabel: true,
                    label: graph.getNodeAttribute(id, 'title') as string,
                  }
                : data;
            }
            return { ...data, color: palette.dim, label: '' };
          },
          edgeReducer: (id, data) => {
            const filter = filterRef.current;
            if (
              filter !== null &&
              graph
                .extremities(id)
                .some((n) => graph.getNodeAttribute(n, 'community') !== filter)
            ) {
              return { ...data, hidden: true };
            }
            const focus = emphasised();
            if (!focus || graph.hasExtremity(id, focus)) {
              return data;
            }
            return { ...data, hidden: true };
          },
        });
        sigmaRenderer.on('enterNode', ({ node }) => {
          hovered = node;
          sigmaRenderer.refresh();
        });
        sigmaRenderer.on('leaveNode', () => {
          hovered = null;
          sigmaRenderer.refresh();
        });
        // Drag a page to move it: the layout is a starting point, and a
        // person untangling a cluster by hand is reading it. Moved pages stay
        // where they are put for this view; nothing is saved.
        let dragged: string | null = null;
        let moved = false;
        sigmaRenderer.on('downNode', ({ node }) => {
          dragged = node;
          moved = false;
          // Freeze the frame: without a fixed box Sigma refits the camera to
          // the nodes on every move, and the graph drifts under the cursor.
          if (!sigmaRenderer.getCustomBBox()) {
            sigmaRenderer.setCustomBBox(sigmaRenderer.getBBox());
          }
        });
        const captor = sigmaRenderer.getMouseCaptor();
        captor.on('mousemovebody', (event) => {
          if (!dragged) {
            return;
          }
          moved = true;
          const position = sigmaRenderer.viewportToGraph(event);
          graph.setNodeAttribute(dragged, 'x', position.x);
          graph.setNodeAttribute(dragged, 'y', position.y);
          // The camera would pan with the same gesture otherwise.
          event.preventSigmaDefault();
          event.original.preventDefault();
          event.original.stopPropagation();
        });
        const drop = () => {
          dragged = null;
        };
        captor.on('mouseup', drop);
        captor.on('mouseleave', drop);
        sigmaRenderer.on('clickNode', ({ node }) => {
          // The click that ends a drag is not a pick.
          if (moved) {
            moved = false;
            return;
          }
          setSelected(view.nodes.find((n) => n.id === node) ?? null);
        });
        sigmaRenderer.on('clickStage', () => setSelected(null));
        // Sigma fits the camera to the nodes, not to their labels, and a
        // label is drawn to the right of its node — so the rightmost page's
        // name ran off the canvas ("Zgłaszani…"). Zoom out a little and shift
        // the view right by the same share, which leaves the extra room on
        // the side the labels grow into. A larger graph keeps the tight fit:
        // zoomed out, it only got smaller and its labels ran together.
        if (roomy) {
          sigmaRenderer.getCamera().setState({ x: 0.62, y: 0.5, ratio: 1.32 });
        }
        renderer.current = sigmaRenderer;
        kill = () => {
          renderer.current = null;
          sigmaRenderer.kill();
        };
      } catch {
        setFailed(true);
      }
    })();
    return () => {
      disposed = true;
      kill?.();
    };
  }, [view]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) {
      return [];
    }
    return view.nodes
      .filter((n) => n.title.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, view.nodes]);

  /** Select a page and move the camera onto it — search's way in. */
  const flyTo = (node: Node) => {
    setSelected(node);
    setQuery('');
    const sigma = renderer.current;
    const display = sigma?.getNodeDisplayData(node.id);
    if (sigma && display) {
      void sigma
        .getCamera()
        .animate(
          { x: display.x, y: display.y, ratio: 0.35 },
          { duration: 400 },
        );
    }
  };

  const controlClass =
    'rounded-md border border-border bg-card p-1.5 text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground';

  const relations = selected
    ? view.edges
        .filter((e) => e.from === selected.id || e.to === selected.id)
        .map((e) => ({
          edge: e,
          other: view.nodes.find(
            (n) => n.id === (e.from === selected.id ? e.to : e.from),
          ),
        }))
    : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* What the assistant beside Brain is told the operator is looking at. */}
      <BrainScreen
        context={{
          view: 'graph',
          ...(view.focus ? { focusPageId: view.focus } : {}),
          ...(selected ? { selectedPageId: selected.id } : {}),
          ...(communityFilter !== null ? { communityFilter } : {}),
        }}
      />
      <div className="relative">
        <div
          ref={container}
          data-testid="brain-graph"
          role="img"
          aria-label={t('canvas-label', {
            nodes: view.shown.nodes,
            edges: view.shown.edges,
          })}
          // As tall as the window allows, never under 600px: a fixed height
          // left a large graph cramped on a tall screen.
          className="h-[calc(100svh-15rem)] min-h-[600px] w-full rounded-[6px] border border-border bg-background"
        />
        {failed && (
          <p className="absolute inset-x-0 top-4 text-center text-sm text-muted-foreground">
            {t('failed')}
          </p>
        )}
        {!failed && (
          <>
            {/*
              Finding one page among forty by eye was the slowest thing on
              this screen. Type part of a title; picking a result selects the
              page and flies the camera to it.
            */}
            <div className="absolute left-3 top-3 w-72">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && matches[0]) {
                    flyTo(matches[0]);
                  }
                  if (e.key === 'Escape') {
                    setQuery('');
                  }
                }}
                placeholder={t('search-placeholder')}
                aria-label={t('search-placeholder')}
                data-testid="brain-graph-search"
                className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground"
              />
              {query.trim().length >= 2 && (
                <ul
                  className="mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-card py-1 text-sm shadow-md"
                  data-testid="brain-graph-search-results"
                >
                  {matches.length === 0 ? (
                    <li className="px-3 py-1.5 text-muted-foreground">
                      {t('search-empty')}
                    </li>
                  ) : (
                    matches.map((node) => (
                      <li key={node.id}>
                        <button
                          type="button"
                          onClick={() => flyTo(node)}
                          className="w-full truncate px-3 py-1.5 text-left text-foreground hover:bg-muted"
                        >
                          {node.title}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
            <div className="absolute right-3 top-3 flex flex-col gap-1">
              <button
                type="button"
                className={controlClass}
                aria-label={t('zoom-in')}
                title={t('zoom-in')}
                onClick={() =>
                  void renderer.current
                    ?.getCamera()
                    .animatedZoom({ duration: 200 })
                }
              >
                <MagnifyingGlassPlusIcon className="size-4" />
              </button>
              <button
                type="button"
                className={controlClass}
                aria-label={t('zoom-out')}
                title={t('zoom-out')}
                onClick={() =>
                  void renderer.current
                    ?.getCamera()
                    .animatedUnzoom({ duration: 200 })
                }
              >
                <MagnifyingGlassMinusIcon className="size-4" />
              </button>
              <button
                type="button"
                className={controlClass}
                aria-label={t('zoom-fit')}
                title={t('zoom-fit')}
                onClick={() =>
                  void renderer.current
                    ?.getCamera()
                    .animatedReset({ duration: 300 })
                }
              >
                <ArrowsPointingOutIcon className="size-4" />
              </button>
            </div>
          </>
        )}
      </div>
      <aside className="space-y-4 text-sm">
        {selected ? (
          <div
            className="rounded-[6px] border border-border p-3"
            data-testid="brain-graph-card"
          >
            <p className="font-medium text-foreground">{selected.title}</p>
            {selected.openFindings > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t('open-findings', { count: selected.openFindings })}
              </p>
            )}
            <ul className="mt-2 space-y-2 text-sm">
              {/*
                One relation per row, read as a sentence: the page it points
                at first and in full, the kind of relation above it with the
                direction, and its origin as the legend's line — the words are
                the line's tooltip and its screen-reader text, not a phrase
                repeated on every row.
              */}
              {relations.map(({ edge, other }, i) => {
                const outgoing = edge.from === selected.id;
                return (
                  <li
                    key={i}
                    data-testid="brain-graph-relation"
                    className="flex items-start gap-2"
                  >
                    <span title={t(`origin.${edge.origin}`)}>
                      <EdgeSwatch origin={edge.origin} />
                      <span className="sr-only">
                        {t(`origin.${edge.origin}`)}
                      </span>
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        {outgoing ? `${edge.kind} →` : `← ${edge.kind}`}
                      </p>
                      {other ? (
                        <button
                          type="button"
                          onClick={() => flyTo(other)}
                          className="text-left text-foreground underline-offset-4 hover:underline"
                        >
                          {other.title}
                        </button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 flex flex-col gap-1">
              <Link
                href={`/brain/pages/${selected.id}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                {t('open-page')}
              </Link>
              <Link
                href={`/brain/graph?focus=${selected.id}&budget=${view.budget}${view.includeInferred ? '&inferred=1' : ''}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                {t('show-neighbourhood')}
              </Link>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">{t('select-hint')}</p>
        )}
        <div>
          <h3 className="mb-1 text-xs font-medium uppercase text-muted-foreground">
            {t('legend-title')}
          </h3>
          {/*
            Each line is shown, not described: the swatch is drawn from the
            same width and colour as the canvas, and the text says only what
            the line means.
          */}
          <ul className="space-y-1.5 text-xs" data-testid="brain-graph-legend">
            {(
              [
                ['EXTRACTED', 'legend-extracted'],
                ['AMBIGUOUS', 'legend-ambiguous'],
                ['INFERRED', 'legend-inferred'],
              ] as const
            ).map(([origin, key]) => (
              <li key={origin} className="flex items-start gap-2">
                <EdgeSwatch origin={origin} />
                <span>{t(key)}</span>
              </li>
            ))}
            <li className="flex items-start gap-2">
              <FindingSwatch />
              <span>{t('legend-findings')}</span>
            </li>
          </ul>
        </div>
        {view.communities.some((c) => c.size > 1) && (
          <div>
            <h3 className="mb-1 text-xs font-medium uppercase text-muted-foreground">
              {t('communities-title')}
            </h3>
            {/*
              A group is a filter: picking one dims every page outside it,
              picking it again brings them back.
            */}
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {view.communities
                .filter((c) => c.size > 1)
                .slice(0, 8)
                .map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      aria-pressed={communityFilter === c.id}
                      onClick={() =>
                        setCommunityFilter((current) =>
                          current === c.id ? null : c.id,
                        )
                      }
                      className={`flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-muted hover:text-foreground ${
                        communityFilter === c.id
                          ? 'bg-muted font-medium text-foreground'
                          : ''
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="inline-block size-2 shrink-0 rounded-full"
                        style={{
                          background: (() => {
                            const { token, alpha } = communityColour(c.id);
                            return alpha === 1
                              ? `var(${token})`
                              : `color-mix(in srgb, var(${token}) ${alpha * 100}%, var(--background))`;
                          })(),
                        }}
                      />
                      {t('community', { label: c.label, size: c.size })}
                    </button>
                  </li>
                ))}
            </ul>
            {communityFilter !== null && (
              <button
                type="button"
                onClick={() => setCommunityFilter(null)}
                className="mt-1 px-1 text-xs text-primary underline-offset-4 hover:underline"
              >
                {t('show-all-groups')}
              </button>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

/**
 * The chart tokens as RGB strings sigma can read. Each token is painted
 * into one pixel and read back, which works for any colour syntax the
 * browser supports — oklch included — without a colour library.
 */
function tokenColours(el: HTMLElement) {
  const style = getComputedStyle(el);
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const rgb = (token: string, alpha = 1) => {
    const value = style.getPropertyValue(token).trim();
    if (!ctx || !value) {
      return `rgba(128,128,128,${alpha})`;
    }
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgba(${r},${g},${b},${alpha})`;
  };
  // `token` over the page background at `share`, read back as one opaque
  // colour — see `communityColour` for why Sigma must not get a translucent one.
  const mixed = (token: string, share: number) => {
    const value = style.getPropertyValue(token).trim();
    const background = style.getPropertyValue('--background').trim();
    if (!ctx || !value || !background) {
      return rgb(token);
    }
    ctx.clearRect(0, 0, 1, 1);
    ctx.globalAlpha = 1;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, 1, 1);
    ctx.globalAlpha = share;
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    ctx.globalAlpha = 1;
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgba(${r},${g},${b},1)`;
  };
  return {
    community: (id: number) => {
      const { token, alpha } = communityColour(id);
      return alpha === 1 ? rgb(token) : mixed(token, alpha);
    },
    edge: {
      EXTRACTED: rgb(EDGE_STYLE.EXTRACTED.token, EDGE_STYLE.EXTRACTED.alpha),
      AMBIGUOUS: rgb(EDGE_STYLE.AMBIGUOUS.token, EDGE_STYLE.AMBIGUOUS.alpha),
      INFERRED: rgb(EDGE_STYLE.INFERRED.token, EDGE_STYLE.INFERRED.alpha),
    },
    dim: rgb('--border'),
    label: rgb('--foreground'),
    surface: rgb('--card'),
    border: rgb('--border'),
  };
}
