/**
 * Instance branding: one product name, one logo and one palette for the whole
 * install (spec 2026-10-17-ragen-as-an-on-premises-appliance, D5 and B2).
 *
 * Shared because two apps have to agree on it. `apps/admin` offers the
 * choices and checks an upload before sending it; `apps/web` stores the
 * result, serves the logo and paints the panel. A palette id that one of them
 * knows and the other does not would be saved by the first and silently
 * ignored by the second — the drift ADR-33 exists to stop.
 */

/**
 * The palettes an operator may pick, in the order the admin panel lists them.
 *
 * A palette is a whole brand ramp (`--color-brand-50` … `-950`), defined in
 * `apps/web/src/app/[locale]/global.css` under
 * `:root:has([data-palette='<id>'])`. Every semantic token that derives from
 * the ramp — `--primary`, `--ring`, `--accent`, the sidebar's — follows it in
 * both themes, so no component names a colour and the literal-colour guard
 * keeps passing. `text-tokens-meet-contrast.test.ts` measures each palette
 * with the same pairs as the default one.
 *
 * What is deliberately **not** here:
 *
 * - **Crimson.** It is the destructive colour and the rationed `--marker`
 *   (panel rule 16); a crimson primary would make "Delete" and "Save" the
 *   same button.
 * - **Green and amber.** They encode document and job state and nothing else
 *   (panel rule 17), so a green primary would read as "Ready" everywhere.
 */
export const INSTANCE_PALETTES = [
  'ragen',
  'ocean',
  'petrol',
  'violet',
  'graphite',
] as const;

export type InstancePalette = (typeof INSTANCE_PALETTES)[number];

/** Today's navy. An install with no branding row renders exactly this. */
export const DEFAULT_INSTANCE_PALETTE: InstancePalette = 'ragen';

export function isInstancePalette(value: unknown): value is InstancePalette {
  return (
    typeof value === 'string' &&
    (INSTANCE_PALETTES as readonly string[]).includes(value)
  );
}

/**
 * How the admin panel shows each choice.
 *
 * `swatch` is the ramp's 600 step — the light theme's `--primary` — and it is
 * only a preview. The CSS is the source of truth; a test reads `global.css`
 * and fails if a swatch here stops matching the step it describes.
 */
export const INSTANCE_PALETTE_OPTIONS: Record<
  InstancePalette,
  { label: string; swatch: string }
> = {
  ragen: { label: 'Ragen navy (default)', swatch: '#394d9d' },
  ocean: { label: 'Ocean blue', swatch: '#02598e' },
  petrol: { label: 'Petrol', swatch: '#045f70' },
  violet: { label: 'Violet', swatch: '#613f92' },
  graphite: { label: 'Graphite', swatch: '#4e5562' },
};

/** What the panel, the page titles and the emails say with no row. */
export const DEFAULT_PRODUCT_NAME = 'Ragen AI';

/** Long enough for "Acme Knowledge Assistant", short enough for the sidebar. */
export const PRODUCT_NAME_MAX_LENGTH = 40;

/**
 * 512 KB, under Next's 1 MB default Server Action body limit with room for
 * the rest of the form. A logo is a few kilobytes; anything near this is a
 * photograph, and it would be fetched on every page and in every email.
 */
export const LOGO_MAX_BYTES = 512 * 1024;

export const LOGO_TYPES = ['png', 'jpeg', 'webp', 'svg'] as const;
export type LogoType = (typeof LOGO_TYPES)[number];

export const LOGO_CONTENT_TYPES: Record<LogoType, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

/** The extension a stored logo carries, which is how the server knows its type. */
export const LOGO_EXTENSIONS: Record<LogoType, string> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
  svg: 'svg',
};

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

function ascii(bytes: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...bytes.slice(from, to));
}

/**
 * What the bytes are, from their content — never from the filename or the
 * `Content-Type` a browser sent, both of which the uploader chooses.
 *
 * SVG is recognised by its root element after an optional BOM, XML
 * declaration and comments. Recognising it does not make it safe; see
 * {@link findUnsafeSvgConstruct}.
 */
export function detectLogoType(bytes: Uint8Array): LogoType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'png';
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return 'jpeg';
  }
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === 'RIFF' &&
    ascii(bytes, 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }

  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.slice(0, 4096))
    .replace(/^\uFEFF/, '')
    .replace(/<\?xml[\s\S]*?\?>/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trimStart();
  if (/^<svg[\s>]/i.test(head)) {
    return 'svg';
  }
  return null;
}

/**
 * Constructs that make an SVG more than a picture. The first one found is
 * returned, so the refusal can say what it was.
 *
 * An allowlist sanitizer would be stronger, and this repository has none that
 * runs on a server. So this is one of three layers, not the only one: the
 * logo is drawn with `<img>`, where no script in an SVG ever runs, and it is
 * served with a `sandbox` content-security policy, so opening its URL directly
 * runs nothing either. This layer keeps a hostile file out of storage at all.
 *
 * External references are refused too, not only scripts: a logo that loads
 * `https://…` reports every page view — and every email open — to whoever
 * serves it.
 */
const UNSAFE_SVG: ReadonlyArray<readonly [RegExp, string]> = [
  // `(?:[\w.-]+:)?` because XML allows a namespace prefix: `<s:script>` with
  // `xmlns:s` bound to SVG is a script element too.
  [/<\s*(?:[\w.-]+:)?script/i, 'a <script> element'],
  [/<\s*(?:[\w.-]+:)?foreignObject/i, 'a <foreignObject> element'],
  [
    /<\s*(?:[\w.-]+:)?(iframe|embed|object|audio|video)\b/i,
    'an embedded document',
  ],
  [/<\s*(?:[\w.-]+:)?image\b/i, 'an embedded image'],
  [
    /<\s*(?:[\w.-]+:)?(animate|set|animateMotion|animateTransform)\b/i,
    'an animation',
  ],
  [/<!\s*(ENTITY|DOCTYPE)/i, 'a DTD or entity declaration'],
  [/\son[a-z]+\s*=/i, 'an event-handler attribute'],
  [/(javascript|vbscript)\s*:/i, 'a script URL'],
  [/data\s*:\s*text\/html/i, 'an HTML data URL'],
  [/@import/i, 'a stylesheet import'],
  // The lookahead takes the optional quote, and the whitespace before it,
  // inside it. Outside, `['"]?` or `\s*` can match nothing and leave a quote
  // or a space for the lookahead to see, which is not `#` — so `href="#g"`
  // and `href= "#g"` were refused as external.
  [/url\((?!\s*['"]?\s*#)/i, 'an external url() reference'],
  [
    // Any prefix, not only `xlink:`: a document may bind any prefix to the
    // XLink namespace.
    /\s(?:[\w.-]+:)?href\s*=(?!\s*['"]?\s*#)/i,
    'a link to something outside the file',
  ],
];

export function findUnsafeSvgConstruct(svg: string): string | null {
  for (const [pattern, what] of UNSAFE_SVG) {
    if (pattern.test(svg)) {
      return what;
    }
  }
  return null;
}

export type LogoCheck =
  | { ok: true; type: LogoType; contentType: string; extension: string }
  | { ok: false; reason: string };

/**
 * Everything a logo upload has to pass, in one place, so the admin panel's
 * early check and apps/web's authoritative one cannot disagree.
 */
export function checkLogo(bytes: Uint8Array): LogoCheck {
  if (bytes.length === 0) {
    return { ok: false, reason: 'The logo file is empty.' };
  }
  if (bytes.length > LOGO_MAX_BYTES) {
    return {
      ok: false,
      reason: `The logo is over the ${LOGO_MAX_BYTES / 1024} KB limit. Export it smaller, or as SVG, and try again.`,
    };
  }

  const type = detectLogoType(bytes);
  if (!type) {
    return {
      ok: false,
      reason: 'The logo must be a PNG, JPEG, WebP or SVG image.',
    };
  }

  if (type === 'svg') {
    const unsafe = findUnsafeSvgConstruct(new TextDecoder().decode(bytes));
    if (unsafe) {
      return {
        ok: false,
        reason: `The SVG contains ${unsafe}, which a logo cannot carry. Export it as a plain drawing, or as PNG.`,
      };
    }
  }

  return {
    ok: true,
    type,
    contentType: LOGO_CONTENT_TYPES[type],
    extension: LOGO_EXTENSIONS[type],
  };
}
