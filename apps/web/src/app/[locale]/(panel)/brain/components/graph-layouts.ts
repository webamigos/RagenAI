/**
 * The graph's layout as an operator left it, remembered in this browser.
 *
 * A snapshot of every page in the view, not only the ones dragged. The
 * automatic layout spreads names apart by stretching the whole graph, so a
 * dragged page saved on its own comes back at a scale the rest no longer
 * share, and drifts a little further on every visit. The snapshot brings the
 * picture back exactly; only pages new since it was taken are laid out, around
 * the ones that were already there.
 *
 * Per view: the graph never draws everything, and a layout's coordinates only
 * mean something inside the view they were laid out in — an overview of 150
 * pages and one page's neighbourhood are spread at different scales. So the
 * key is what picks the view (focus, reach, budget, inferred).
 *
 * localStorage, not the database: the layout is one person's working aid, not
 * shared state (a shared one would need a decision about who may rearrange it
 * for everyone). Every read and write tolerates storage being unavailable —
 * a private window just does not remember.
 */

export type Position = { x: number; y: number };
export type Layout = Record<string, Position>;

export type ViewIdentity = {
  focus: string | null;
  hops: number;
  budget: number;
  includeInferred: boolean;
};

const STORAGE_KEY = 'ragen.brain-graph.layouts';
/**
 * Views remembered before the least recently arranged one is forgotten. A
 * 1,000-page snapshot is about 60 KB, so ten stay well inside the quota.
 */
export const MAX_VIEWS = 10;
/** The largest view the graph draws (the top budget); anything past it is not a view. */
export const MAX_NODES_PER_VIEW = 1000;

type Stored = {
  v: 1;
  views: Record<string, { at: number; nodes: Layout }>;
};

export function viewKey(view: ViewIdentity): string {
  return [
    view.focus ?? 'overview',
    view.hops,
    view.budget,
    view.includeInferred ? 'inferred' : 'stated',
  ].join('|');
}

function isPosition(value: unknown): value is Position {
  return (
    typeof value === 'object' &&
    value !== null &&
    Number.isFinite((value as Position).x) &&
    Number.isFinite((value as Position).y)
  );
}

function read(): Stored {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Stored>) : null;
    if (parsed?.v === 1 && parsed.views && typeof parsed.views === 'object') {
      return parsed as Stored;
    }
  } catch {
    // Unavailable or malformed: start over rather than fail the graph.
  }
  return { v: 1, views: {} };
}

function write(stored: Stored) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Full or blocked: the layout still holds until the page is left.
  }
}

/** Four decimals: far below a pixel at any zoom, and a third of the bytes. */
const round = (n: number) => Math.round(n * 1e4) / 1e4;

/** The view's saved layout, or `{}`. Anything malformed is dropped, not trusted. */
export function loadLayout(key: string): Layout {
  const nodes = read().views[key]?.nodes ?? {};
  return Object.fromEntries(
    Object.entries(nodes).filter(([, p]) => isPosition(p)),
  );
}

/** Replaces the view's layout with this one, and marks the view as just used. */
export function saveLayout(key: string, layout: Layout, now = Date.now()) {
  const nodes: Layout = {};
  for (const [id, p] of Object.entries(layout)) {
    if (Object.keys(nodes).length >= MAX_NODES_PER_VIEW) {
      break;
    }
    if (isPosition(p)) {
      nodes[id] = { x: round(p.x), y: round(p.y) };
    }
  }
  const stored = read();
  stored.views[key] = { at: now, nodes };
  const views = Object.entries(stored.views).sort(
    ([, a], [, b]) => b.at - a.at,
  );
  stored.views = Object.fromEntries(views.slice(0, MAX_VIEWS));
  write(stored);
}

/** Forgets the view's layout: the automatic one again. */
export function clearLayout(key: string) {
  const stored = read();
  if (!stored.views[key]) {
    return;
  }
  delete stored.views[key];
  write(stored);
}
