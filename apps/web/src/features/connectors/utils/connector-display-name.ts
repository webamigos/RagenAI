/**
 * What to call a connector in the UI.
 *
 * The eleven built-ins have a translated name under
 * `settings-page.connectors.providers.<slug>.name`, and those translations are
 * the ones a reader expects — Polish included. An entry an operator added has
 * no key, and next-intl renders the key path itself when one is missing, so
 * `providers.notion.name` appeared where "Notion" belonged.
 *
 * The catalogue's own `label` is the fallback. Same shape as `ConnectorCard`'s
 * inline check, lifted here because three surfaces need it.
 */
export function connectorDisplayName(
  hasKey: (key: string) => boolean,
  translate: (key: string) => string,
  slug: string,
  fallback: string,
): string {
  const key = `${slug}.name`;

  return hasKey(key) ? translate(key) : fallback;
}
