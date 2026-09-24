/**
 * The `brain:` links an answer may carry (see the system prompt), resolved to
 * the Brain view the operator is in. Anything else is not a link the
 * assistant may make: it is rendered as text, so an answer cannot send the
 * operator to an address the model wrote.
 */
export function resolveBrainLink(href: string | undefined): string | null {
  if (!href) {
    return null;
  }
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  const page = new RegExp(`^brain:page/(${uuid})$`, 'i').exec(href);
  if (page) {
    return `/brain/pages/${page[1]}`;
  }
  const source = new RegExp(`^brain:source/(${uuid})/(\\d+)$`, 'i').exec(href);
  if (source) {
    return `/brain/pages/${source[1]}#source-${source[2]}`;
  }
  const finding = new RegExp(`^brain:finding/(${uuid})$`, 'i').exec(href);
  if (finding) {
    return `/brain/findings?finding=${finding[1]}#finding-${finding[1]}`;
  }
  return null;
}

/** Whether a link is a citation of a quote, which the panel draws as a marker. */
export function isSourceLink(href: string | undefined): boolean {
  return typeof href === 'string' && href.startsWith('brain:source/');
}
