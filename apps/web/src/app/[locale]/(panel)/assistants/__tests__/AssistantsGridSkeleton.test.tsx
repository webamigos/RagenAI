import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AssistantsGridSkeleton } from '../AssistantsGridSkeleton';

describe('AssistantsGridSkeleton', () => {
  it('renderuje 6 kart placeholder', () => {
    const { container } = render(<AssistantsGridSkeleton />);
    const cards = container.querySelectorAll('.rounded-xl');
    expect(cards).toHaveLength(6);
  });

  it('siatka ma klasę grid', () => {
    const { container } = render(<AssistantsGridSkeleton />);
    expect(container.firstChild).toHaveClass('grid');
  });

  it('każda karta ma min-h-[120px]', () => {
    const { container } = render(<AssistantsGridSkeleton />);
    const cards = container.querySelectorAll('.min-h-\\[120px\\]');
    expect(cards).toHaveLength(6);
  });
});
