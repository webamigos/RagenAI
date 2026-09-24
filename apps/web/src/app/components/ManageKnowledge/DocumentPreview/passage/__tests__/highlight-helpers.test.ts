import { describe, expect, it, vi } from 'vitest';

import {
  clearPassageHighlights,
  highlightPassageInElement,
  scrollPassageIntoView,
} from '../highlight-in-element';
import {
  findPassagePage,
  passageRangesInItems,
  renderMarkedItem,
  type PdfTextSource,
} from '../pdf-passage';

const PASSAGE =
  'Zwrot środków następuje na rachunek wskazany przez klienta, najpóźniej w terminie.';

describe('highlightPassageInElement', () => {
  const build = (html: string) => {
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
  };

  it('wraps each text node the match crosses and returns the first mark', () => {
    const root = build(
      '<p>Wstęp.</p><p>Zwrot środków następuje na <b>rachunek wskazany</b> przez klienta, najpóźniej w terminie.</p>',
    );
    const first = highlightPassageInElement(root, PASSAGE);
    const marks = root.querySelectorAll('mark');

    expect(marks).toHaveLength(3);
    expect(first).toBe(marks[0]);
    expect(root.querySelector('b mark')?.textContent).toBe('rachunek wskazany');
    // The text itself is untouched.
    expect(root.textContent).toBe(
      'Wstęp.Zwrot środków następuje na rachunek wskazany przez klienta, najpóźniej w terminie.',
    );
  });

  it('leaves whitespace-only nodes between blocks unmarked', () => {
    const root = build(
      '<ul><li>Zwrot środków następuje na rachunek</li>\n  <li>wskazany przez klienta, najpóźniej w terminie.</li></ul>',
    );
    highlightPassageInElement(root, PASSAGE);
    const marks = Array.from(root.querySelectorAll('mark'));
    expect(marks).toHaveLength(2);
    expect(marks.every((mark) => mark.parentElement?.tagName === 'LI')).toBe(
      true,
    );
  });

  it('returns null and changes nothing when the passage is absent', () => {
    const root = build('<p>Inna treść.</p>');
    expect(highlightPassageInElement(root, PASSAGE)).toBeNull();
    expect(root.innerHTML).toBe('<p>Inna treść.</p>');
  });

  it('can take its marks away again', () => {
    const html =
      '<p>Zwrot środków następuje na <b>rachunek wskazany</b> przez klienta, najpóźniej w terminie.</p>';
    const root = build(html);
    highlightPassageInElement(root, PASSAGE);
    clearPassageHighlights(root);
    root.normalize();
    expect(root.innerHTML).toBe(html);
  });

  it('scrolls to the middle, and does nothing where scrolling does not exist', () => {
    const element = document.createElement('mark');
    expect(() => scrollPassageIntoView(element)).not.toThrow();
    const scroll = vi.fn();
    element.scrollIntoView = scroll;
    scrollPassageIntoView(element);
    expect(scroll).toHaveBeenCalledWith({ block: 'center', inline: 'nearest' });
    expect(() => scrollPassageIntoView(null)).not.toThrow();
  });
});

describe('passageRangesInItems', () => {
  it('maps a match across text items, skipping marked-content entries', () => {
    const items = [
      { type: 'beginMarkedContent' },
      { str: 'Nagłówek ' },
      { str: 'Zwrot środków następuje na rachunek ' },
      { type: 'endMarkedContent' },
      { str: 'wskazany przez klienta, najpóźniej w terminie.' },
    ];
    const ranges = passageRangesInItems(items, PASSAGE)!;
    expect([...ranges.keys()]).toEqual([2, 4]);
    // The whole item, trailing space included: the passage runs on past it.
    expect(ranges.get(2)).toEqual([
      0,
      'Zwrot środków następuje na rachunek '.length,
    ]);
    expect(ranges.get(4)).toEqual([
      0,
      'wskazany przez klienta, najpóźniej w terminie.'.length,
    ]);
  });

  it('returns null when the page does not hold the passage', () => {
    expect(
      passageRangesInItems([{ str: 'Nic tu nie ma.' }], PASSAGE),
    ).toBeNull();
  });
});

describe('renderMarkedItem', () => {
  it('escapes the text and wraps its range in a mark', () => {
    expect(renderMarkedItem('a <b> c', [2, 5])).toBe(
      'a <mark class="rounded-xs bg-highlight/60 text-transparent mix-blend-multiply" data-cited-passage="">&lt;b&gt;</mark> c',
    );
    expect(renderMarkedItem('"x" & y', undefined)).toBe(
      '&quot;x&quot; &amp; y',
    );
  });
});

describe('findPassagePage', () => {
  const pdf = (pages: string[][]): PdfTextSource => ({
    numPages: pages.length,
    getPage: vi.fn(async (n: number) => ({
      getTextContent: async () => ({
        items: pages[n - 1].map((str) => ({ str })),
      }),
    })),
  });

  it('returns the first page holding the passage', async () => {
    expect(
      await findPassagePage(
        pdf([['Spis'], ['Wstęp'], [PASSAGE], [PASSAGE]]),
        PASSAGE,
      ),
    ).toBe(3);
  });

  it('returns null when no page does', async () => {
    expect(
      await findPassagePage(pdf([['Spis'], ['Wstęp']]), PASSAGE),
    ).toBeNull();
  });

  it('stops reading pages once cancelled', async () => {
    const source = pdf([['a'], ['b'], [PASSAGE]]);
    let reads = 0;
    const result = await findPassagePage(source, PASSAGE, () => ++reads > 1);
    expect(result).toBeNull();
    expect(source.getPage).toHaveBeenCalledTimes(1);
  });
});
