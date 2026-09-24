/**
 * Spread a laid-out graph until its *names* stop overlapping, not just its
 * dots.
 *
 * ForceAtlas2 with `adjustSizes` keeps nodes apart by their drawn size, but a
 * page's name is ten times wider than its dot and is drawn to its right, so
 * two pages a comfortable distance apart still wrote their titles over each
 * other.
 *
 * Why not `graphology-layout-noverlap`: it separates *circles*. A name is a
 * box about 210×16 px, and the circle around it is 210 px across — forty of
 * those need ten times the canvas, so it could never converge. This separates
 * the boxes themselves, pushing each colliding pair apart along the axis they
 * overlap least on, which for wide, short labels is nearly always vertical —
 * so the left-to-right structure ForceAtlas2 found is kept.
 *
 * It works in pixels at the scale sigma will draw at. Sigma refits the graph
 * to the canvas afterwards, so pushing pages apart shrinks everything a
 * little; hence a few rounds, each re-measuring that scale. When forty names
 * simply do not fit, what overlap remains is left to Sigma's label grid, and
 * zooming in shows them.
 */

/** The label size BrainGraphCanvas gives sigma. */
export const LABEL_SIZE_PX = 12;
/** Average glyph width at LABEL_SIZE_PX. */
export const LABEL_CHAR_PX = 6.5;
/** A label's height at LABEL_SIZE_PX, plus a little air above and below. */
const LABEL_HEIGHT_PX = 15;
/** Names longer than this are shortened on the canvas; the card, the search and hover show them whole. */
export const LABEL_MAX_CHARS = 28;

/** A page's name as the canvas draws it. */
export function canvasLabel(title: string): string {
  return title.length > LABEL_MAX_CHARS
    ? `${title.slice(0, LABEL_MAX_CHARS - 1).trimEnd()}…`
    : title;
}
/** Clear space kept to the right of each name, in pixels. */
const LABEL_GAP_PX = 6;
/**
 * A push clears the overlap by this much more. Without it two boxes settle
 * exactly edge to edge, and floating point leaves them a hair inside each
 * other — counted, and pushed again, forever.
 */
const SEPARATION_SLACK_PX = 1;
/** Sigma's `stagePadding` in BrainGraphCanvas; the rest of the canvas is the stage. */
const STAGE_PADDING_PX = 60;

export type LabelledGraph = {
  forEachNode(
    fn: (key: string, attributes: Record<string, unknown>) => void,
  ): void;
  getNodeAttribute(key: string, name: string): unknown;
  setNodeAttribute(key: string, name: string, value: unknown): unknown;
};

/** Pixels per layout unit if the graph's current spread is fitted to `viewport`. */
export function pixelsPerUnit(
  graph: Pick<LabelledGraph, 'forEachNode'>,
  viewport: { width: number; height: number },
): number {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  graph.forEachNode((_, a) => {
    const x = a.x as number;
    const y = a.y as number;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
  // Sigma normalises by the *larger* extent into a unit square and fits
  // that square to the canvas's *shorter* side (`createNormalizationFunction`
  // in sigma's source). Fitting each axis separately overstated the scale on
  // a wide canvas and left names still touching.
  const span = Math.max(maxX - minX, maxY - minY, 1e-6);
  const stage = Math.max(
    Math.min(viewport.width, viewport.height) - 2 * STAGE_PADDING_PX,
    1,
  );
  return stage / span;
}

/** A label's width in pixels, dot and gap included. */
export function labelWidthPx(label: string, nodeSizePx: number): number {
  return 2 * nodeSizePx + label.length * LABEL_CHAR_PX + LABEL_GAP_PX;
}

type Box = { id: string; x: number; y: number; width: number };

/** Boxes in pixels: from the node's left edge to the end of its name. */
function boxesOf(graph: LabelledGraph, ppu: number): Box[] {
  const boxes: Box[] = [];
  graph.forEachNode((id, a) => {
    const size = (a.size as number | undefined) ?? 0;
    boxes.push({
      id,
      x: (a.x as number) * ppu - size,
      y: (a.y as number) * ppu,
      width: labelWidthPx(String(a.label ?? ''), size),
    });
  });
  return boxes;
}

/** How many pairs of names collide at the scale sigma would draw at. */
export function countLabelOverlaps(
  graph: LabelledGraph,
  viewport: { width: number; height: number },
): number {
  const boxes = boxesOf(graph, pixelsPerUnit(graph, viewport));
  let count = 0;
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      // Half a pixel of tolerance: a touch is not a collision.
      if (
        Math.abs(a.y - b.y) < LABEL_HEIGHT_PX - 0.5 &&
        a.x + 0.5 < b.x + b.width &&
        b.x + 0.5 < a.x + a.width
      ) {
        count += 1;
      }
    }
  }
  return count;
}

export function separateLabels(
  graph: LabelledGraph,
  viewport: { width: number; height: number },
  {
    rounds = 12,
    iterations = 200,
  }: { rounds?: number; iterations?: number } = {},
): void {
  for (let round = 0; round < rounds; round += 1) {
    const ppu = pixelsPerUnit(graph, viewport);
    const boxes = boxesOf(graph, ppu);
    let moved = false;
    for (let step = 0; step < iterations; step += 1) {
      let collided = false;
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i]!;
          const b = boxes[j]!;
          const overlapY = LABEL_HEIGHT_PX - Math.abs(a.y - b.y);
          const overlapX = Math.min(a.x + a.width - b.x, b.x + b.width - a.x);
          if (overlapY <= 0.5 || overlapX <= 0.5) {
            continue;
          }
          collided = true;
          // Half each, along the cheaper axis. Two nodes on the same spot
          // are split by index, so the pair still separates.
          if (overlapY <= overlapX) {
            const dir = a.y < b.y || (a.y === b.y && i < j) ? -1 : 1;
            a.y += (dir * (overlapY + SEPARATION_SLACK_PX)) / 2;
            b.y -= (dir * (overlapY + SEPARATION_SLACK_PX)) / 2;
          } else {
            const dir = a.x < b.x ? -1 : 1;
            a.x += (dir * (overlapX + SEPARATION_SLACK_PX)) / 2;
            b.x -= (dir * (overlapX + SEPARATION_SLACK_PX)) / 2;
          }
        }
      }
      if (!collided) {
        break;
      }
      moved = true;
    }
    if (!moved) {
      return;
    }
    for (const box of boxes) {
      const size = (graph.getNodeAttribute(box.id, 'size') as number) ?? 0;
      graph.setNodeAttribute(box.id, 'x', (box.x + size) / ppu);
      graph.setNodeAttribute(box.id, 'y', box.y / ppu);
    }
  }
}
