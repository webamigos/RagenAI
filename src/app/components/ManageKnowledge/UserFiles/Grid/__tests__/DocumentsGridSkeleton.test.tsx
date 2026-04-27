import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DocumentsGridSkeleton } from '../DocumentsGridSkeleton';

describe('DocumentsGridSkeleton', () => {
  it('renderuje 9 kart FileCardSkeleton', () => {
    const { container } = render(<DocumentsGridSkeleton />);
    const cards = container.querySelectorAll('.rounded-lg');
    expect(cards).toHaveLength(9);
  });

  it('siatka kart ma klasy grid-cols-1 sm:grid-cols-2 xl:grid-cols-3', () => {
    const { container } = render(<DocumentsGridSkeleton />);
    const grid = container.querySelector('.grid');
    expect(grid?.className).toContain('grid-cols-1');
    expect(grid?.className).toContain('sm:grid-cols-2');
    expect(grid?.className).toContain('xl:grid-cols-3');
  });

  it('każda karta ma sekcję nagłówkową z dwoma elementami skeleton', () => {
    const { container } = render(<DocumentsGridSkeleton />);
    const cards = container.querySelectorAll('.rounded-lg');
    cards.forEach((card) => {
      const header = card.querySelector('.px-3.py-2.flex.items-center.gap-2');
      expect(header).toBeInTheDocument();
      expect(header?.querySelectorAll('.animate-pulse')).toHaveLength(2);
    });
  });

  it('każda karta ma sekcję podglądu z aspect-ratio', () => {
    const { container } = render(<DocumentsGridSkeleton />);
    const cards = container.querySelectorAll('.rounded-lg');
    cards.forEach((card) => {
      expect(card.querySelector('[class*="aspect-"]')).toBeInTheDocument();
    });
  });

  it('każda karta ma sekcję stopki z dwoma elementami skeleton', () => {
    const { container } = render(<DocumentsGridSkeleton />);
    const cards = container.querySelectorAll('.rounded-lg');
    cards.forEach((card) => {
      const footer = card.querySelector(
        '.px-3.py-2.flex.items-center.justify-between',
      );
      expect(footer).toBeInTheDocument();
      expect(footer?.querySelectorAll('.animate-pulse')).toHaveLength(2);
    });
  });

  it('renderuje pasek filtrów z 3 elementami skeleton', () => {
    const { container } = render(<DocumentsGridSkeleton />);
    const filtersBar = container.querySelector('.flex.items-center.gap-2');
    expect(filtersBar).toBeInTheDocument();
    expect(filtersBar?.querySelectorAll('.animate-pulse')).toHaveLength(3);
  });

  it('wszystkie elementy animate-pulse są obecne w DOM', () => {
    const { container } = render(<DocumentsGridSkeleton />);
    const pulses = container.querySelectorAll('.animate-pulse');
    // 9 kart × 5 elementów skeleton + 3 filtry bar = 48
    expect(pulses).toHaveLength(48);
  });
});
