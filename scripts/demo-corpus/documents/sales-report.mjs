/** 2025 sales: by month, by region and quarter, and the largest customers. */

import { COMPANY, LINES, REGIONS, REGION_KEYS, REVENUE_2025, TOP_CUSTOMERS_2025 } from '../data.mjs';
import { pick } from '../format.mjs';
import { MONTHS, QUARTERS, monthlyBySegment, quarterlyByRegion } from '../numbers.mjs';

export const format = 'xlsx';

export const file = {
  pl: 'sprzedaz-2025.xlsx',
  en: 'sales-2025.xlsx',
};

const COPY = {
  pl: {
    summarySheet: 'Podsumowanie',
    summaryTitle: 'Sprzedaż 2025 — podsumowanie',
    summarySubtitle: `${COMPANY.name}, wartości w PLN netto. Dane skonsolidowane, zgodne z raportem rocznym 2025.`,
    summaryHeaders: ['Segment', 'Przychód 2025', 'Udział w przychodzie'],
    monthSheet: 'Wg miesięcy',
    monthTitle: 'Sprzedaż 2025 według miesięcy i segmentów',
    monthSubtitle: 'Wartości w PLN netto.',
    monthColumn: 'Miesiąc',
    regionSheet: 'Wg regionów',
    regionTitle: 'Sprzedaż 2025 według regionów i kwartałów',
    regionSubtitle: 'Wartości w PLN netto. Region Eksport obejmuje Niemcy, Czechy i Litwę.',
    regionColumn: 'Region',
    customerSheet: 'Najwięksi klienci',
    customerTitle: 'Najwięksi klienci 2025',
    customerSubtitle:
      'Wartości w PLN netto. Żaden klient nie przekracza 10% przychodu — próg koncentracji ' +
      'przyjęty przez zarząd.',
    customerHeaders: ['Klient', 'Region', 'Przychód 2025', 'Udział w przychodzie'],
    total: 'Razem',
    totalYear: 'Razem 2025',
  },
  en: {
    summarySheet: 'Summary',
    summaryTitle: 'Sales 2025 — summary',
    summarySubtitle: `${COMPANY.name}, values in PLN net. Consolidated, consistent with the 2025 annual report.`,
    summaryHeaders: ['Segment', 'Revenue 2025', 'Share of revenue'],
    monthSheet: 'By month',
    monthTitle: 'Sales 2025 by month and segment',
    monthSubtitle: 'Values in PLN net.',
    monthColumn: 'Month',
    regionSheet: 'By region',
    regionTitle: 'Sales 2025 by region and quarter',
    regionSubtitle: 'Values in PLN net. The Export region covers Germany, the Czech Republic and Lithuania.',
    regionColumn: 'Region',
    customerSheet: 'Largest customers',
    customerTitle: 'Largest customers 2025',
    customerSubtitle:
      'Values in PLN net. No customer exceeds 10% of revenue — the concentration limit set by ' +
      'the board.',
    customerHeaders: ['Customer', 'Region', 'Revenue 2025', 'Share of revenue'],
    total: 'Total',
    totalYear: 'Total 2025',
  },
};

export function build(kit, workbook, locale) {
  const s = COPY[locale];
  const segments = Object.keys(REVENUE_2025);
  const total = Object.values(REVENUE_2025).reduce((sum, value) => sum + value, 0);
  const monthly = monthlyBySegment();

  kit.addSheet(
    workbook,
    s.summarySheet,
    {
      title: s.summaryTitle,
      subtitle: s.summarySubtitle,
      headers: s.summaryHeaders,
      rows: [
        ...segments.map((segment) => [
          pick(LINES[segment], locale),
          REVENUE_2025[segment],
          REVENUE_2025[segment] / total,
        ]),
        [s.total, total, 1],
      ],
      widths: [22, 20, 22],
      formats: { 1: kit.MONEY, 2: kit.PERCENT },
    },
    locale,
  );

  kit.addSheet(
    workbook,
    s.monthSheet,
    {
      title: s.monthTitle,
      subtitle: s.monthSubtitle,
      headers: [s.monthColumn, ...segments.map((segment) => pick(LINES[segment], locale)), s.total],
      rows: [
        ...MONTHS.map((month, index) => {
          const values = segments.map((segment) => monthly[segment][index]);
          return [pick(month, locale), ...values, values.reduce((sum, value) => sum + value, 0)];
        }),
        [
          s.totalYear,
          ...segments.map((segment) => monthly[segment].reduce((sum, value) => sum + value, 0)),
          total,
        ],
      ],
      widths: [16, 16, 16, 16, 16, 18],
      formats: { 1: kit.MONEY, 2: kit.MONEY, 3: kit.MONEY, 4: kit.MONEY, 5: kit.MONEY },
    },
    locale,
  );

  const byRegion = quarterlyByRegion();
  const quarterTotals = QUARTERS.map((_, index) =>
    REGION_KEYS.reduce((sum, key) => sum + byRegion[key][index], 0),
  );

  kit.addSheet(
    workbook,
    s.regionSheet,
    {
      title: s.regionTitle,
      subtitle: s.regionSubtitle,
      headers: [s.regionColumn, ...QUARTERS, s.total],
      rows: [
        ...REGION_KEYS.map((key) => [
          pick(REGIONS[key], locale),
          ...byRegion[key],
          byRegion[key].reduce((sum, value) => sum + value, 0),
        ]),
        [s.total, ...quarterTotals, total],
      ],
      widths: [16, 16, 16, 16, 16, 18],
      formats: { 1: kit.MONEY, 2: kit.MONEY, 3: kit.MONEY, 4: kit.MONEY, 5: kit.MONEY },
    },
    locale,
  );

  kit.addSheet(
    workbook,
    s.customerSheet,
    {
      title: s.customerTitle,
      subtitle: s.customerSubtitle,
      headers: s.customerHeaders,
      rows: TOP_CUSTOMERS_2025.map((customer) => [
        customer.name,
        pick(REGIONS[customer.region], locale),
        customer.revenue,
        customer.revenue / total,
      ]),
      widths: [36, 14, 20, 22],
      formats: { 2: kit.MONEY, 3: kit.PERCENT },
    },
    locale,
  );
}
