import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { NotFoundLayout } from '../NotFoundLayout';

const defaultProps = {
  title: 'Page not found',
  description: "Sorry, we couldn't find the page you're looking for.",
  backLabel: 'Go back to home',
};

describe('NotFoundLayout', () => {
  it('renders the title', () => {
    render(<NotFoundLayout {...defaultProps} />);
    expect(
      screen.getByRole('heading', { name: defaultProps.title }),
    ).toBeInTheDocument();
  });

  it('renders the description', () => {
    render(<NotFoundLayout {...defaultProps} />);
    expect(screen.getByText(defaultProps.description)).toBeInTheDocument();
  });

  it('renders the 404 display text', () => {
    render(<NotFoundLayout {...defaultProps} />);
    const occurrences = screen.getAllByText('404');
    expect(occurrences.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the back link pointing to "/"', () => {
    render(<NotFoundLayout {...defaultProps} />);
    const link = screen.getByRole('link', {
      name: new RegExp(defaultProps.backLabel),
    });
    expect(link).toHaveAttribute('href', '/');
  });

  it('renders the back link with the correct label', () => {
    render(<NotFoundLayout {...defaultProps} />);
    expect(
      screen.getByRole('link', { name: new RegExp(defaultProps.backLabel) }),
    ).toBeInTheDocument();
  });

  it('reflects different prop values', () => {
    render(
      <NotFoundLayout
        title="Nie znaleziono strony"
        description="Przepraszamy, nie znaleźliśmy tej strony."
        backLabel="Wróć na stronę główną"
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'Nie znaleziono strony' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Przepraszamy, nie znaleźliśmy tej strony.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Wróć na stronę główną/ }),
    ).toBeInTheDocument();
  });
});
