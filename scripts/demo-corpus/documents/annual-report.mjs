/** The 2025 annual report: the figures the sales spreadsheet has to add up to. */

import {
  CAPEX_2025,
  COMPANY,
  EBITDA_2024,
  EBITDA_2025,
  EXPORT_MARKETS,
  EXPORT_SHARE,
  EXPORT_SHARE_2024,
  HEADCOUNT_2024,
  HEADCOUNT_2025,
  LARGEST_CUSTOMER_SHARE,
  LINES,
  REVENUE_2024_TOTAL,
  REVENUE_2025,
  REVENUE_TARGET_2026,
  WAREHOUSES,
} from '../data.mjs';
import { millions, money, number, percent, percentPoints, pick } from '../format.mjs';

export const format = 'pdf';

export const file = {
  pl: 'raport-roczny-2025.pdf',
  en: 'annual-report-2025.pdf',
};

const COPY = {
  pl: {
    title: 'Raport roczny 2025',
    subtitle: 'sprawozdanie zarządu z działalności, marzec 2026',
    letter: 'List prezesa zarządu',
    letterBody: (total, previous, growth) =>
      `Rok 2025 zamknęliśmy przychodem ${total} wobec ${previous} rok wcześniej, co oznacza ` +
      `wzrost o ${growth}. Wzrost pochodził w większości ze sprzedaży konstrukcji regałowych ` +
      'oraz z rynków eksportowych, gdzie rozpoczęliśmy współpracę z trzema nowymi ' +
      'dystrybutorami.',
    letterBody2:
      'Najważniejszą decyzją roku było uruchomienie własnej linii lakierniczej, które skróciło ' +
      'czas realizacji zamówień na regały malowane proszkowo z 28 do 14 dni roboczych.',
    signature: 'Marta Zielińska, Prezes Zarządu',
    financials: 'Wyniki finansowe',
    financialHeaders: ['Wskaźnik', '2025', '2024', 'Zmiana'],
    rowRevenue: 'Przychód ze sprzedaży',
    rowEbitda: 'EBITDA',
    rowMargin: 'Marża EBITDA',
    rowHeadcount: 'Zatrudnienie na koniec roku',
    rowExport: 'Udział eksportu w przychodzie',
    people: (count) => `${count} osób`,
    peopleDelta: (count) => `+${count} osób`,
    points: (value) => `+${value} p.p.`,
    segments: 'Sprzedaż według segmentów',
    segmentHeaders: ['Segment', 'Przychód 2025', 'Udział'],
    totalRow: 'Razem',
    segmentNote:
      'Segment serwisowy, choć najmniejszy, rośnie najszybciej: liczba klientów z aktywną ' +
      'umową serwisową wzrosła z 41 do 68. Umowy serwisowe są dla nas przychodem powtarzalnym ' +
      'i priorytetem sprzedażowym na rok 2026.',
    markets: 'Rynki i klienci',
    marketsBody: (share, markets, largest) =>
      `Eksport odpowiadał za ${share} przychodu. Główne rynki to ${markets}. Największy klient ` +
      `odpowiadał za ${largest} przychodu — utrzymujemy przyjętą przez zarząd zasadę, ` +
      'że żaden pojedynczy klient nie przekracza 10%.',
    investments: 'Inwestycje',
    investmentsBody: (capex) => `Nakłady inwestycyjne w 2025 roku wyniosły ${capex}.`,
    investmentsPlan:
      'W 2026 roku planujemy uruchomienie magazynu regionalnego w Gdańsku (1 czerwca 2026) ' +
      'z budżetem 2 400 000 zł oraz rekrutację 12 osób do jego obsługi.',
    locations: 'Zasoby i lokalizacje',
    locationHeaders: ['Kod', 'Lokalizacja', 'Adres', 'Status'],
    outlook: 'Perspektywy na 2026 rok',
    outlookBody: (target) =>
      `Celem przychodowym na rok 2026 jest ${target}, z udziałem eksportu na poziomie 26%. ` +
      'Cel zakłada podwyżkę cen katalogowych o 4,5% od 1 kwietnia 2026 oraz pełne uruchomienie ' +
      'magazynu w Gdańsku w drugim półroczu.',
    outlookRisk:
      'Głównym ryzykiem pozostaje dostępność komponentów do wózków elektrycznych, gdzie czas ' +
      'dostawy od producenta wynosi 35 dni roboczych.',
    footer: `${COMPANY.name} · Raport roczny 2025 · dokument demonstracyjny`,
  },
  en: {
    title: 'Annual Report 2025',
    subtitle: "directors' report, March 2026",
    letter: "Chief executive's statement",
    letterBody: (total, previous, growth) =>
      `We closed 2025 with revenue of ${total} against ${previous} a year earlier, a rise of ` +
      `${growth}. Most of the growth came from racking sales and from export markets, where ` +
      'we began working with three new distributors.',
    letterBody2:
      'The most consequential decision of the year was commissioning our own paint line, which ' +
      'cut the lead time on powder-coated racking from 28 to 14 working days.',
    signature: 'Marta Zielińska, Chief Executive Officer',
    financials: 'Financial results',
    financialHeaders: ['Measure', '2025', '2024', 'Change'],
    rowRevenue: 'Revenue',
    rowEbitda: 'EBITDA',
    rowMargin: 'EBITDA margin',
    rowHeadcount: 'Headcount at year end',
    rowExport: 'Export share of revenue',
    people: (count) => `${count} people`,
    peopleDelta: (count) => `+${count} people`,
    points: (value) => `+${value} pp`,
    segments: 'Revenue by segment',
    segmentHeaders: ['Segment', 'Revenue 2025', 'Share'],
    totalRow: 'Total',
    segmentNote:
      'The service segment is the smallest and the fastest growing: customers on an active ' +
      'service agreement rose from 41 to 68. Service agreements are recurring revenue and a ' +
      'sales priority for 2026.',
    markets: 'Markets and customers',
    marketsBody: (share, markets, largest) =>
      `Exports accounted for ${share} of revenue. The main markets are ${markets}. The largest ` +
      `single customer accounted for ${largest} of revenue — we hold to the board's rule that ` +
      'no one customer exceeds 10%.',
    investments: 'Capital expenditure',
    investmentsBody: (capex) => `Capital expenditure in 2025 was ${capex}.`,
    investmentsPlan:
      'For 2026 we plan to open a regional warehouse in Gdańsk on 1 June 2026, with a budget ' +
      'of PLN 2,400,000, and to recruit 12 people to run it.',
    locations: 'Sites',
    locationHeaders: ['Code', 'Location', 'Address', 'Status'],
    outlook: 'Outlook for 2026',
    outlookBody: (target) =>
      `The revenue target for 2026 is ${target}, with exports at 26%. The target assumes the ` +
      '4.5% list price increase from 1 April 2026 and the Gdańsk warehouse fully operational ' +
      'in the second half of the year.',
    outlookRisk:
      'The principal risk remains the availability of components for electric pallet trucks, ' +
      'where the manufacturer quotes 35 working days.',
    footer: `${COMPANY.name} · Annual Report 2025 · demonstration document`,
  },
};

export function build(kit, doc, locale) {
  const s = COPY[locale];
  const total = Object.values(REVENUE_2025).reduce((sum, value) => sum + value, 0);
  const growth = ((total - REVENUE_2024_TOTAL) / REVENUE_2024_TOTAL) * 100;

  kit.title(
    doc,
    s.title,
    `${COMPANY.name}, ${COMPANY.street}, ${COMPANY.city} · NIP ${COMPANY.nip} · ${s.subtitle}`,
  );

  kit.heading(doc, s.letter, 1);
  kit.para(
    doc,
    s.letterBody(millions(total, locale), millions(REVENUE_2024_TOTAL, locale), percentPoints(growth, locale)),
  );
  kit.para(doc, s.letterBody2);
  kit.para(doc, s.signature);

  kit.heading(doc, s.financials, 1);
  kit.table(
    doc,
    s.financialHeaders,
    [
      [s.rowRevenue, money(total, locale), money(REVENUE_2024_TOTAL, locale), `+${percentPoints(growth, locale)}`],
      [
        s.rowEbitda,
        money(EBITDA_2025, locale),
        money(EBITDA_2024, locale),
        `+${percentPoints(((EBITDA_2025 - EBITDA_2024) / EBITDA_2024) * 100, locale)}`,
      ],
      [
        s.rowMargin,
        percent(EBITDA_2025 / total, locale),
        percent(EBITDA_2024 / REVENUE_2024_TOTAL, locale),
        // The bare number: `points()` supplies the unit, and percentPoints would
        // have made it "+2.1% pp".
        s.points(number((EBITDA_2025 / total - EBITDA_2024 / REVENUE_2024_TOTAL) * 100, locale, 1)),
      ],
      [
        s.rowHeadcount,
        s.people(HEADCOUNT_2025),
        s.people(HEADCOUNT_2024),
        s.peopleDelta(HEADCOUNT_2025 - HEADCOUNT_2024),
      ],
      [s.rowExport, EXPORT_SHARE, EXPORT_SHARE_2024, s.points('5')],
    ],
    [5.5, 3.5, 3.5, 3],
  );

  kit.heading(doc, s.segments, 1);
  kit.table(
    doc,
    s.segmentHeaders,
    [
      ...Object.entries(REVENUE_2025).map(([segment, value]) => [
        pick(LINES[segment], locale),
        money(value, locale),
        percent(value / total, locale),
      ]),
      [s.totalRow, money(total, locale), percent(1, locale)],
    ],
    [5, 5.5, 4],
  );
  kit.para(doc, s.segmentNote);

  kit.heading(doc, s.markets, 1);
  kit.para(
    doc,
    s.marketsBody(EXPORT_SHARE, pick(EXPORT_MARKETS, locale), pick(LARGEST_CUSTOMER_SHARE, locale)),
  );

  kit.heading(doc, s.investments, 1);
  kit.para(doc, s.investmentsBody(pick(CAPEX_2025, locale)));
  kit.para(doc, s.investmentsPlan);

  kit.heading(doc, s.locations, 1);
  kit.table(
    doc,
    s.locationHeaders,
    WAREHOUSES.map((warehouse) => [
      warehouse.code,
      warehouse.city,
      warehouse.address,
      pick(warehouse.status, locale),
    ]),
    [2, 3.5, 5.5, 5],
  );

  kit.heading(doc, s.outlook, 1);
  kit.para(doc, s.outlookBody(pick(REVENUE_TARGET_2026, locale)));
  kit.para(doc, s.outlookRisk);

  kit.footerNote(doc, s.footer);
}
