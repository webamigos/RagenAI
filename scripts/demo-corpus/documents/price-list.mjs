/** The price list: prices by product line, discount bands, commercial terms. */

import { COMPANY, DISCOUNTS, LINES, PAYMENT_DAYS, PRICE_INCREASE_2026, PRODUCTS, PRODUCT_LINES, VAT_RATE } from '../data.mjs';
import { pick } from '../format.mjs';

export const format = 'xlsx';

export const file = {
  pl: 'cennik-2026.xlsx',
  en: 'price-list-2026.xlsx',
};

const COPY = {
  pl: {
    sheetTitle: (line) => `Cennik 2026 — ${line}`,
    subtitle: (increase) =>
      `${COMPANY.name}, obowiązuje od 1 stycznia 2026. Ceny netto w PLN, VAT ${VAT_RATE}. ` +
      `Podwyżka cen katalogowych: ${increase}.`,
    headers: ['SKU', 'Nazwa produktu', 'Jednostka', 'Cena netto', 'Cena brutto', 'Gwarancja (mies.)', 'Czas dostawy (dni rob.)'],
    termsSheet: 'Rabaty i warunki',
    termsTitle: 'Rabaty progowe i warunki handlowe',
    discountHeaders: ['Wielkość zamówienia (jedna pozycja)', 'Rabat od ceny katalogowej'],
    termsHeaders: ['Warunek', 'Zasada'],
    terms: (days) => [
      ['Termin płatności', `${days} dni od daty wystawienia faktury`],
      ['Waluta rozliczeń', 'PLN; dla klientów zagranicznych EUR po kursie NBP z dnia wystawienia faktury'],
      ['Warunki dostawy', 'DAP zgodnie z Incoterms 2020, dla zamówień powyżej 15 000 zł netto transport gratis'],
      ['Minimum logistyczne', '2 500 zł netto na zamówienie'],
      ['Ważność oferty', '30 dni od daty wystawienia'],
      ['Montaż', '12% wartości netto zamówionych regałów, wycena indywidualna powyżej 200 szt.'],
      ['Przegląd okresowy regałów', '1 490 zł netto za lokalizację, wymagany raz na 12 miesięcy'],
    ],
  },
  en: {
    sheetTitle: (line) => `Price list 2026 — ${line}`,
    subtitle: (increase) =>
      `${COMPANY.name}, in force from 1 January 2026. Net prices in PLN, VAT ${VAT_RATE}. ` +
      `List price increase: ${increase}.`,
    headers: ['SKU', 'Product', 'Unit', 'Net price', 'Gross price', 'Warranty (months)', 'Lead time (working days)'],
    termsSheet: 'Discounts and terms',
    termsTitle: 'Volume discounts and commercial terms',
    discountHeaders: ['Order size (one line)', 'Discount off list price'],
    termsHeaders: ['Term', 'Rule'],
    terms: (days) => [
      ['Payment terms', `${days} days from the invoice date`],
      ['Settlement currency', 'PLN; for customers abroad, EUR at the NBP rate on the invoice date'],
      ['Delivery terms', 'DAP under Incoterms 2020; free transport on orders above PLN 15,000 net'],
      ['Minimum order', 'PLN 2,500 net per order'],
      ['Quote validity', '30 days from the date of issue'],
      ['Installation', '12% of the net value of the racking ordered; quoted individually above 200 units'],
      ['Periodic racking inspection', 'PLN 1,490 net per site, required every 12 months'],
    ],
  },
};

export function build(kit, workbook, locale) {
  const s = COPY[locale];

  for (const line of PRODUCT_LINES) {
    const rows = PRODUCTS.filter((product) => product.line === line).map((product) => [
      product.sku,
      pick(product.name, locale),
      pick(product.unit, locale),
      product.price,
      Math.round(product.price * 1.23 * 100) / 100,
      product.warranty,
      product.lead,
    ]);

    kit.addSheet(
      workbook,
      pick(LINES[line], locale),
      {
        title: s.sheetTitle(pick(LINES[line], locale)),
        subtitle: s.subtitle(pick(PRICE_INCREASE_2026, locale)),
        headers: s.headers,
        rows,
        widths: [12, 42, 11, 16, 16, 18, 22],
        formats: { 3: kit.MONEY_DECIMAL, 4: kit.MONEY_DECIMAL },
      },
      locale,
    );
  }

  kit.addSheet(
    workbook,
    s.termsSheet,
    {
      title: s.termsTitle,
      subtitle: COMPANY.name,
      headers: s.discountHeaders,
      rows: DISCOUNTS.map((band) => [pick(band.band, locale), band.discount]),
      widths: [38, 28],
    },
    locale,
  );

  kit.addSheet(
    workbook,
    locale === 'pl' ? 'Warunki handlowe' : 'Commercial terms',
    {
      title: s.termsTitle,
      subtitle: COMPANY.name,
      headers: s.termsHeaders,
      rows: s.terms(PAYMENT_DAYS),
      widths: [32, 76],
    },
    locale,
  );
}
