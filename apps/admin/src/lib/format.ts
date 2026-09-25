import { format } from 'date-fns';

export function formatDate(date: Date | string): string {
  return format(new Date(date), 'dd/MM/yyyy');
}

export function formatDateTime(date: Date | string): string {
  return format(new Date(date), 'dd/MM/yyyy HH:mm');
}

/**
 * An AI cost, in US dollars. The pricing tables (`ai-pricing.ts` in web and
 * api) are per-million-token list prices in USD, so every estimated cost is a
 * dollar amount — the panel showed it with a euro sign since the Scaleway
 * migration, and with a dollar sign on the organization page.
 */
export function formatUsd(amount: number, fractionDigits = 2): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}
