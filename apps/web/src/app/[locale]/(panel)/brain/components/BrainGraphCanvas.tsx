'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import type { BrainGraphView } from '@/features/brain/contracts/brain-graph.types';
import { Link } from '@/i18n/routing';

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

/** Up to this many pages, every page is labelled. */
const SMALL_GRAPH = 60;

/** Width carries the origin too, so it is never told by colour alone. */
const EDGE_SIZE = { EXTRACTED: 1.6, AMBIGUOUS: 1, INFERRED: 0.6 } as const;

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

  // A new view is a new picture: the card follows the focus, or closes.
  // Adjusted while rendering, as React recommends for state derived from a
  // prop, rather than in an effect that would render twice.
  const [shownView, setShownView] = useState(view);
  if (shownView !== view) {
    setShownView(view);
    setSelected(view.nodes.find((n) => n.id === view.focus) ?? null);
  }

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
            label: node.title,
            color: palette.community(node.community),
            forceLabel:
              labelAll || node.openFindings > 0 || node.id === view.focus,
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
          fa2.default.assign(graph, {
            iterations: graph.order > 600 ? 80 : 150,
            settings: fa2.default.inferSettings(graph),
          });
        }

        let hovered: string | null = null;
        const renderer = new Sigma(graph, container.current, {
          renderEdgeLabels: false,
          // Room for the labels of nodes laid out on the edge of the stage.
          stagePadding: 60,
          labelRenderedSizeThreshold: 8,
          labelColor: { color: palette.label },
          nodeReducer: (id, data) => {
            if (!hovered || id === hovered || graph.areNeighbors(id, hovered)) {
              return data;
            }
            return { ...data, color: palette.dim, label: '' };
          },
          edgeReducer: (id, data) => {
            if (!hovered || graph.hasExtremity(id, hovered)) {
              return data;
            }
            return { ...data, hidden: true };
          },
        });
        renderer.on('enterNode', ({ node }) => {
          hovered = node;
          renderer.refresh();
        });
        renderer.on('leaveNode', () => {
          hovered = null;
          renderer.refresh();
        });
        renderer.on('clickNode', ({ node }) => {
          setSelected(view.nodes.find((n) => n.id === node) ?? null);
        });
        renderer.on('clickStage', () => setSelected(null));
        kill = () => renderer.kill();
      } catch {
        setFailed(true);
      }
    })();
    return () => {
      disposed = true;
      kill?.();
    };
  }, [view]);

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
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="relative">
        <div
          ref={container}
          data-testid="brain-graph"
          role="img"
          aria-label={t('canvas-label', {
            nodes: view.shown.nodes,
            edges: view.shown.edges,
          })}
          className="h-[600px] w-full rounded-[6px] border border-border bg-background"
        />
        {failed && (
          <p className="absolute inset-x-0 top-4 text-center text-sm text-muted-foreground">
            {t('failed')}
          </p>
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
            <ul className="mt-2 space-y-1 text-xs">
              {relations.map(({ edge, other }, i) => (
                <li key={i} className="text-muted-foreground">
                  {edge.kind} · {other?.title ?? '—'} ·{' '}
                  <span className="text-foreground">
                    {t(`origin.${edge.origin}`)}
                  </span>
                </li>
              ))}
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
          <ul className="space-y-1 text-xs">
            <li>{t('legend-extracted')}</li>
            <li>{t('legend-ambiguous')}</li>
            <li>{t('legend-inferred')}</li>
            <li>{t('legend-findings')}</li>
          </ul>
        </div>
        {view.communities.some((c) => c.size > 1) && (
          <div>
            <h3 className="mb-1 text-xs font-medium uppercase text-muted-foreground">
              {t('communities-title')}
            </h3>
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {view.communities
                .filter((c) => c.size > 1)
                .slice(0, 8)
                .map((c) => (
                  <li key={c.id} className="flex items-center gap-1.5">
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
                  </li>
                ))}
            </ul>
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
      EXTRACTED: rgb('--muted-foreground', 0.7),
      AMBIGUOUS: rgb('--chart-3', 0.8),
      INFERRED: rgb('--muted-foreground', 0.3),
    },
    dim: rgb('--border'),
    label: rgb('--foreground'),
  };
}
