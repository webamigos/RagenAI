/**
 * The arithmetic behind the spreadsheets.
 *
 * Totals are forced, not approximated: every breakdown is rounded to full
 * thousands and the last row absorbs the rounding, so a prospect who adds up a
 * column gets the figure the annual report quotes. That is the whole trick that
 * makes "what was revenue in 2025?" and "add up racking sales by month" agree.
 *
 * Deterministic — no randomness — so regenerating after an edit produces a diff
 * of what changed and nothing else.
 */

import { MARKETING_BUDGET_2026, MARKETING_CHANNELS, REGION_KEYS, REVENUE_2025, t } from './data.mjs';

export const MONTHS = [
  t('styczeń', 'January'),
  t('luty', 'February'),
  t('marzec', 'March'),
  t('kwiecień', 'April'),
  t('maj', 'May'),
  t('czerwiec', 'June'),
  t('lipiec', 'July'),
  t('sierpień', 'August'),
  t('wrzesień', 'September'),
  t('październik', 'October'),
  t('listopad', 'November'),
  t('grudzień', 'December'),
];

export const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

/** Warehouse trade is slow in January and peaks before the year closes. */
const SEASONALITY = {
  racking: [0.061, 0.067, 0.084, 0.089, 0.091, 0.088, 0.072, 0.07, 0.092, 0.098, 0.096, 0.092],
  trucks: [0.068, 0.071, 0.086, 0.087, 0.084, 0.082, 0.074, 0.073, 0.089, 0.094, 0.097, 0.095],
  accessories: [0.074, 0.076, 0.083, 0.085, 0.086, 0.084, 0.079, 0.078, 0.086, 0.09, 0.09, 0.089],
  service: [0.081, 0.081, 0.084, 0.084, 0.084, 0.083, 0.082, 0.082, 0.084, 0.085, 0.085, 0.085],
};

/**
 * Export is 0.22 because the annual report says export was 22% of revenue, and
 * the two have to agree — a prospect who reads both is exactly the reader this
 * corpus is for. North stays the largest domestic region.
 */
const REGION_SHARE = { north: 0.27, south: 0.18, west: 0.22, east: 0.11, export: 0.22 };

const QUARTER_SHARE = [0.22, 0.26, 0.23, 0.29];

/** Split `total` by `weights`, rounded to `step`, last item absorbing the rest. */
function split(total, weights, step = 1000) {
  const parts = weights.slice(0, -1).map((weight) => Math.round((total * weight) / step) * step);
  parts.push(total - parts.reduce((sum, part) => sum + part, 0));
  return parts;
}

/** 12 monthly figures per segment, each row summing to the segment's year. */
export function monthlyBySegment() {
  return Object.fromEntries(
    Object.entries(REVENUE_2025).map(([segment, year]) => [segment, split(year, SEASONALITY[segment])]),
  );
}

/** 4 quarterly figures per region, the whole table summing to the year. */
export function quarterlyByRegion() {
  const total = Object.values(REVENUE_2025).reduce((sum, value) => sum + value, 0);
  const regionTotals = split(total, REGION_KEYS.map((key) => REGION_SHARE[key]));
  return Object.fromEntries(
    REGION_KEYS.map((key, index) => [key, split(regionTotals[index], QUARTER_SHARE)]),
  );
}

/** Channel × quarter, summing to board resolution 1/2026. */
export function marketingBudget() {
  const channelTotals = split(MARKETING_BUDGET_2026, MARKETING_CHANNELS.map((c) => c.share), 500);
  // Trade fairs cluster in Q1 and Q3; everything else runs flat.
  const shapes = { fairs: [0.38, 0.12, 0.35, 0.15], events: [0.2, 0.3, 0.2, 0.3] };
  return Object.fromEntries(
    MARKETING_CHANNELS.map((channel, index) => [
      channel.key,
      split(channelTotals[index], shapes[channel.key] ?? [0.25, 0.25, 0.25, 0.25], 500),
    ]),
  );
}

/**
 * Stock per warehouse. Gdańsk (M3) opens in June 2026, so it holds nothing yet
 * — which is itself an answerable fact. WZE-20 and AKS-025 sit below their
 * minimum, and both have an inbound order in `INBOUND_ORDERS`.
 */
export const STOCK = {
  'RGM-200': { M1: 412, M2: 188, M3: 0, minimum: 250, stocktake: '2026-01-31' },
  'RGM-350': { M1: 96, M2: 54, M3: 0, minimum: 80, stocktake: '2026-01-31' },
  'RGP-120': { M1: 1340, M2: 760, M3: 0, minimum: 600, stocktake: '2026-02-28' },
  'RGW-080': { M1: 38, M2: 12, M3: 0, minimum: 30, stocktake: '2026-01-31' },
  'WZR-15': { M1: 204, M2: 143, M3: 0, minimum: 120, stocktake: '2026-02-28' },
  'WZU-13': { M1: 27, M2: 9, M3: 0, minimum: 20, stocktake: '2026-02-28' },
  'WZE-20': { M1: 7, M2: 3, M3: 0, minimum: 12, stocktake: '2026-02-28' },
  'AKB-050': { M1: 2480, M2: 1310, M3: 0, minimum: 1500, stocktake: '2026-02-28' },
  'AKO-100': { M1: 1870, M2: 940, M3: 0, minimum: 800, stocktake: '2026-02-28' },
  'AKS-025': { M1: 210, M2: 120, M3: 0, minimum: 400, stocktake: '2026-01-31' },
  'AKK-001': { M1: 3150, M2: 1720, M3: 0, minimum: 1200, stocktake: '2026-02-28' },
};

export function stockTotal(sku) {
  const row = STOCK[sku];
  return row.M1 + row.M2 + row.M3;
}

export function isBelowMinimum(sku) {
  return stockTotal(sku) < STOCK[sku].minimum;
}
