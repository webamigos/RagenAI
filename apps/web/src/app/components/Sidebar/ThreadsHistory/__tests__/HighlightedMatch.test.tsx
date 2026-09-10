import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { HighlightedMatch } from '../HighlightedMatch';

const marks = () => screen.queryAllByRole('mark').map((m) => m.textContent);

describe('HighlightedMatch', () => {
  it('marks the matched part and leaves the rest alone', () => {
    render(<HighlightedMatch text="umowa-najmu.pdf" query="najmu" />);

    expect(marks()).toEqual(['najmu']);
  });

  it('keeps the original casing of what it marks', () => {
    // Matching is case-insensitive; rendering must not rewrite the name.
    render(<HighlightedMatch text="Umowa.pdf" query="umowa" />);

    expect(marks()).toEqual(['Umowa']);
    expect(screen.getByText(/Umowa/)).toBeInTheDocument();
  });

  it('marks every occurrence, not just the first', () => {
    render(<HighlightedMatch text="raport-raport.pdf" query="raport" />);

    expect(marks()).toEqual(['raport', 'raport']);
  });

  it.each([
    ['brackets', 'umowa (1).pdf', '(1)'],
    ['square brackets', 'umowa [draft].pdf', '[draft]'],
    ['a dot', 'wersja v1.2.pdf', 'v1.2'],
    ['a plus', 'c++ notes.md', 'c++'],
  ])(
    'handles %s in the query without building a pattern',
    (_what, text, query) => {
      // File names are full of regex metacharacters. Compiling one from raw
      // input either throws on an unbalanced bracket or matches the wrong
      // thing, so the search never compiles a pattern at all.
      render(<HighlightedMatch text={text} query={query} />);

      expect(marks()).toEqual([query]);
    },
  );

  it('renders the text untouched when nothing matches', () => {
    render(<HighlightedMatch text="umowa.pdf" query="regulamin" />);

    expect(marks()).toEqual([]);
    expect(screen.getByText('umowa.pdf')).toBeInTheDocument();
  });

  it('renders the text untouched for an empty query', () => {
    render(<HighlightedMatch text="umowa.pdf" query="   " />);

    expect(marks()).toEqual([]);
  });
});
