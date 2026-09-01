/**
 * Resolve a human-readable, locale-aware label for an MCP tool.
 *
 * Tool names arrive in the `{provider}__{tool}` format (e.g.
 * `google_calendar__list_calendar_events`). The i18n key is the
 * bare tool name (after the `__` prefix). When no translation
 * exists the function falls back to replacing underscores with
 * spaces — identical to the previous behaviour.
 *
 * Usage (client component):
 *   const t = useTranslations('tool-labels');
 *   const label = getToolLabel(fullToolName, t);
 */
export function getToolLabel(
  fullToolName: string,
  t: (key: string) => string,
): string {
  const localName = fullToolName.includes('__')
    ? fullToolName.slice(fullToolName.indexOf('__') + 2)
    : fullToolName;

  try {
    const translated = t(localName);
    if (
      translated &&
      translated !== localName &&
      !translated.endsWith(`.${localName}`)
    ) {
      return translated;
    }
  } catch {
    // Key missing — fall through to humanized form
  }

  return localName.replace(/_/g, ' ');
}
