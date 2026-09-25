/**
 * An AI cost, in US dollars. The pricing table (`../constants/ai-pricing.ts`)
 * holds per-million-token list prices in USD, so every estimated cost is a
 * dollar amount; the AI usage page showed it with a euro sign since the
 * Scaleway migration. The same symbol in every locale: the number is USD
 * whatever language the panel is in.
 */
export function formatUsd(amount: number, fractionDigits = 2): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}
