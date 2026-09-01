import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { PiiPolicyAccordion } from '../PiiPolicyAccordion';

const rows = [
  {
    label: 'Bez maskowania',
    masksHeading: 'Co maskuje',
    masks: 'Nic — treść bez zmian',
    examplesHeading: 'Przykłady',
    examples: 'Wszystkie dane',
  },
  {
    label: 'Dane wrażliwe',
    masksHeading: 'Co maskuje',
    masks: 'PESEL, IBAN, karta kredytowa',
    examplesHeading: 'Przykłady',
    examples: 'Nr. dowodu, karta',
  },
];

describe('PiiPolicyAccordion', () => {
  it('renders all row labels', () => {
    render(<PiiPolicyAccordion rows={rows} />);
    expect(screen.getByText('Bez maskowania')).toBeInTheDocument();
    expect(screen.getByText('Dane wrażliwe')).toBeInTheDocument();
  });

  it('content is not in DOM before opening', () => {
    render(<PiiPolicyAccordion rows={rows} />);
    expect(screen.queryByText('Nic — treść bez zmian')).not.toBeInTheDocument();
  });

  it('expands row and shows masks and examples', async () => {
    const user = userEvent.setup();
    render(<PiiPolicyAccordion rows={rows} />);

    await user.click(screen.getByText('Bez maskowania'));

    expect(screen.getByText('Nic — treść bez zmian')).toBeInTheDocument();
    expect(screen.getByText('Wszystkie dane')).toBeInTheDocument();
  });

  it('collapses row when toggled again', async () => {
    const user = userEvent.setup();
    render(<PiiPolicyAccordion rows={rows} />);

    await user.click(screen.getByText('Bez maskowania'));
    expect(screen.getByText('Nic — treść bez zmian')).toBeInTheDocument();

    await user.click(screen.getByText('Bez maskowania'));
    expect(screen.queryByText('Nic — treść bez zmian')).not.toBeInTheDocument();
  });

  it('only one row open at a time (single type)', async () => {
    const user = userEvent.setup();
    render(<PiiPolicyAccordion rows={rows} />);

    await user.click(screen.getByText('Bez maskowania'));
    expect(screen.getByText('Nic — treść bez zmian')).toBeInTheDocument();

    await user.click(screen.getByText('Dane wrażliwe'));
    expect(
      screen.getByText('PESEL, IBAN, karta kredytowa'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Nic — treść bez zmian')).not.toBeInTheDocument();
  });
});
