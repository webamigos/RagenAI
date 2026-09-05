import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { StatTile } from '../StatTile';

function render(props: Parameters<typeof StatTile>[0]): string {
  return renderToStaticMarkup(<StatTile {...props} />);
}

describe('StatTile', () => {
  it('renders the label and value', () => {
    const markup = render({ label: 'Users', value: '1,234' });

    expect(markup).toContain('Users');
    expect(markup).toContain('1,234');
  });

  it('renders as a plain div, not a link, when no href is given', () => {
    const markup = render({ label: 'Threads', value: '42' });

    expect(markup).not.toContain('<a ');
  });

  it('renders as a link to href when one is given', () => {
    const markup = render({
      label: 'AI spend (all-time)',
      value: '€12.34',
      href: '/ai-usage',
    });

    expect(markup).toContain('<a ');
    expect(markup).toContain('href="/ai-usage"');
  });

  it('applies the warn tone class only when tone is warn', () => {
    const warned = render({
      label: 'Critical incidents',
      value: '3',
      tone: 'warn',
    });
    const clean = render({ label: 'Critical incidents', value: '0' });

    expect(warned).toContain('text-destructive');
    expect(clean).not.toContain('text-destructive');
  });
});
