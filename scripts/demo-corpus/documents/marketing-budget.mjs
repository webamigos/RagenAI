/** The 2026 marketing budget, and what was actually spent in 2025. */

import { COMPANY, EXECUTION_2025, MARKETING_BUDGET_2026, MARKETING_CHANNELS } from '../data.mjs';
import { pick } from '../format.mjs';
import { QUARTERS, marketingBudget } from '../numbers.mjs';

export const format = 'xlsx';

export const file = {
  pl: 'budzet-marketingowy-2026.xlsx',
  en: 'marketing-budget-2026.xlsx',
};

const CHANNEL_BY_KEY = Object.fromEntries(MARKETING_CHANNELS.map((channel) => [channel.key, channel]));

const COPY = {
  pl: {
    budgetSheet: 'Budżet 2026',
    budgetTitle: 'Budżet marketingowy 2026',
    budgetSubtitle:
      'Zatwierdzony uchwałą zarządu nr 1/2026 z 12 lutego 2026. Wartości w PLN netto.',
    channel: 'Kanał',
    total: 'Razem',
    share: 'Udział',
    executionSheet: 'Wykonanie 2025',
    executionTitle: 'Budżet marketingowy 2025 — plan i wykonanie',
    executionSubtitle: 'Wartości w PLN netto. Baza porównawcza dla budżetu 2026.',
    executionHeaders: ['Kanał', 'Plan 2025', 'Wykonanie 2025', 'Różnica', 'Wykonanie planu'],
    rulesSheet: 'Zasady',
    rulesTitle: 'Zasady wydatkowania budżetu',
    rulesHeaders: ['Zasada', 'Treść'],
    rules: [
      ['Akceptacja', 'Wydatek powyżej 20 000 zł netto wymaga akceptacji dyrektora finansowego.'],
      ['Przesunięcia', 'Przesunięcie środków między kanałami do 10% wartości kanału nie wymaga zgody zarządu.'],
      ['Rezerwa', 'Niewykorzystane środki kwartału przechodzą na kwartał następny, ale nie na rok następny.'],
      ['Raportowanie', 'Dyrektor handlowy raportuje wykonanie budżetu na pierwszym posiedzeniu zarządu po zakończeniu kwartału.'],
      ['Targi', 'Udział w targach Modernlog i Logimat jest wydatkiem obligatoryjnym i nie podlega przesunięciu.'],
    ],
  },
  en: {
    budgetSheet: 'Budget 2026',
    budgetTitle: 'Marketing budget 2026',
    budgetSubtitle:
      'Approved by board resolution 1/2026 of 12 February 2026. Values in PLN net.',
    channel: 'Channel',
    total: 'Total',
    share: 'Share',
    executionSheet: 'Actuals 2025',
    executionTitle: 'Marketing budget 2025 — plan and actuals',
    executionSubtitle: 'Values in PLN net. The comparison base for the 2026 budget.',
    executionHeaders: ['Channel', 'Plan 2025', 'Actual 2025', 'Variance', 'Plan achieved'],
    rulesSheet: 'Rules',
    rulesTitle: 'Rules for spending the budget',
    rulesHeaders: ['Rule', 'Detail'],
    rules: [
      ['Approval', 'Spending above PLN 20,000 net requires the Chief Financial Officer’s approval.'],
      ['Reallocation', 'Moving up to 10% of a channel’s value to another channel does not need board consent.'],
      ['Carry-over', 'Unspent funds carry to the next quarter, but not to the next year.'],
      ['Reporting', 'The Sales Director reports budget performance at the first board meeting after each quarter.'],
      ['Trade fairs', 'Attendance at the Modernlog and Logimat fairs is mandatory spend and cannot be reallocated.'],
    ],
  },
};

export function build(kit, workbook, locale) {
  const s = COPY[locale];
  const budget = marketingBudget();
  const quarterTotals = QUARTERS.map((_, index) =>
    MARKETING_CHANNELS.reduce((sum, channel) => sum + budget[channel.key][index], 0),
  );

  kit.addSheet(
    workbook,
    s.budgetSheet,
    {
      title: s.budgetTitle,
      subtitle: s.budgetSubtitle,
      headers: [s.channel, ...QUARTERS, s.total, s.share],
      rows: [
        ...MARKETING_CHANNELS.map((channel) => {
          const values = budget[channel.key];
          const channelTotal = values.reduce((sum, value) => sum + value, 0);
          return [
            pick(channel.label, locale),
            ...values,
            channelTotal,
            channelTotal / MARKETING_BUDGET_2026,
          ];
        }),
        [s.total, ...quarterTotals, MARKETING_BUDGET_2026, 1],
      ],
      widths: [38, 16, 16, 16, 16, 18, 12],
      formats: { 1: kit.MONEY, 2: kit.MONEY, 3: kit.MONEY, 4: kit.MONEY, 5: kit.MONEY, 6: kit.PERCENT },
    },
    locale,
  );

  const planTotal = EXECUTION_2025.reduce((sum, row) => sum + row.plan, 0);
  const spentTotal = EXECUTION_2025.reduce((sum, row) => sum + row.spent, 0);

  kit.addSheet(
    workbook,
    s.executionSheet,
    {
      title: s.executionTitle,
      subtitle: s.executionSubtitle,
      headers: s.executionHeaders,
      rows: [
        ...EXECUTION_2025.map((row) => [
          pick(CHANNEL_BY_KEY[row.key].label, locale),
          row.plan,
          row.spent,
          row.spent - row.plan,
          row.spent / row.plan,
        ]),
        [s.total, planTotal, spentTotal, spentTotal - planTotal, spentTotal / planTotal],
      ],
      widths: [38, 18, 18, 16, 18],
      formats: { 1: kit.MONEY, 2: kit.MONEY, 3: kit.MONEY, 4: kit.PERCENT },
    },
    locale,
  );

  kit.addSheet(
    workbook,
    s.rulesSheet,
    {
      title: s.rulesTitle,
      subtitle: COMPANY.name,
      headers: s.rulesHeaders,
      rows: s.rules,
      widths: [32, 90],
    },
    locale,
  );
}
