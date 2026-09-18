import {
  PUBLIC_CONFIG_ELEMENT_ID,
  readPublicRuntimeConfig,
} from './public-runtime-config';

/**
 * Writes the deployment's public configuration into the document.
 *
 * A server component, rendered once per request in the root layout, so the
 * values are the container's rather than the build's. Everything the browser
 * needs and cannot be baked into an image passes through here — see
 * `public-runtime-config.ts` for why that is the whole point.
 *
 * It renders *inside* `<body>` and before the application, because a client
 * module may read the configuration while it initialises and the element has
 * to exist by then. React inserts script tags in document order, so a reader
 * running during hydration finds it.
 *
 * `JSON.stringify` output goes into a `type="application/json"` script, which
 * the browser does not execute. The one escape that still matters there is
 * `</script>` appearing inside a value — a URL or a domain list could contain
 * it — so `<` is escaped. Without that, a crafted `TRUSTED_LINK_DOMAINS` could
 * close the element early and put the rest of the JSON into the document as
 * markup.
 */
export function PublicRuntimeConfigScript() {
  const serialised = JSON.stringify(readPublicRuntimeConfig()).replace(
    /</g,
    '\\u003c',
  );

  return (
    <script
      id={PUBLIC_CONFIG_ELEMENT_ID}
      type="application/json"
      // The content is JSON this component produced from the environment, not
      // anything a request supplied, and the escape above covers the one
      // character that could leave the element.
      dangerouslySetInnerHTML={{ __html: serialised }}
    />
  );
}
