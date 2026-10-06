/** Sigma camera ratio: smaller values mean closer zoom. */
export const GRAPH_LABEL_ZOOM_THRESHOLD = 0.7;
export function shouldShowGraphLabel(
  ratio: number,
  highlighted: boolean,
): boolean {
  return highlighted || ratio <= GRAPH_LABEL_ZOOM_THRESHOLD;
}
