/**
 * The product catalogue: eleven products with their technical parameters.
 *
 * Both languages sit in one file so a translation that drifts is visible in the
 * diff that caused it. The numbers come from `data.mjs` and are formatted per
 * locale, so the two versions quote the same figures.
 */

import {
  COMPANY,
  DISCOUNTS,
  LINES,
  PRODUCTS,
  PRODUCT_LINES,
  PRODUCT_SPECS,
  SLA_INSPECTION_INTERVAL,
  VAT_RATE,
} from '../data.mjs';
import { money, months, pick, workingDays } from '../format.mjs';

export const format = 'pdf';

export const file = {
  pl: 'katalog-produktow-2026.pdf',
  en: 'product-catalogue-2026.pdf',
};

const COPY = {
  pl: {
    title: 'Katalog produktów 2026',
    intro:
      'Wyposażenie magazynowe projektowane i produkowane w Poznaniu od 2011 roku. ' +
      'Wszystkie konstrukcje regałowe spełniają wymagania norm PN-EN 15512 i PN-EN 15620, ' +
      'a każda dostawa obejmuje kartę produktu z dopuszczalnymi obciążeniami.',
    lineIntro: {
      racking:
        'Konstrukcje paletowe, półkowe i wspornikowe do magazynów o wysokości składowania ' +
        'do 6 metrów. Malowanie proszkowe w standardzie, powłoka antykorozyjna dla chłodni ' +
        'i obiektów o wilgotności powyżej 80% za dopłatą 9% ceny katalogowej.',
      trucks:
        'Wózki paletowe i unoszące o udźwigu od 1,3 do 2,0 tony. Modele elektryczne ' +
        'dostarczane są z ładowarką i akumulatorem litowo-jonowym; wymiana akumulatora ' +
        'po okresie gwarancji kosztuje 4 200 zł netto.',
      accessories:
        'Elementy uzupełniające konstrukcje regałowe: belki, osłony, siatki zabezpieczające ' +
        'i kotwy montażowe. Dostępne z magazynu, czas realizacji od 3 dni roboczych.',
    },
    specHeaders: ['Parametr', 'Wartość'],
    priceLabel: 'Cena katalogowa netto',
    warrantyLabel: 'Gwarancja',
    leadLabel: 'Czas dostawy',
    termsHeading: 'Warunki handlowe',
    termsHeaders: ['Wielkość zamówienia', 'Rabat od ceny katalogowej'],
    terms: (inspection) =>
      `Montaż wyceniany jest na 12% wartości netto zamówionych regałów. Przegląd okresowy ` +
      `regałów, wymagany co ${inspection} zgodnie z normą PN-EN 15635, kosztuje 1 490 zł ` +
      `netto za lokalizację. Do wszystkich cen dolicza się VAT ${VAT_RATE}.`,
    contactHeading: 'Kontakt',
    footer: `${COMPANY.name} · Katalog produktów 2026 · dokument demonstracyjny`,
  },
  en: {
    title: 'Product Catalogue 2026',
    intro:
      'Warehouse equipment designed and manufactured in Poznań since 2011. Every racking ' +
      'structure meets the PN-EN 15512 and PN-EN 15620 standards, and each delivery includes ' +
      'a product card stating the permissible loads.',
    lineIntro: {
      racking:
        'Pallet, shelving and cantilever structures for warehouses storing up to 6 metres ' +
        'high. Powder coating is standard; an anti-corrosion finish for cold stores and sites ' +
        'above 80% humidity adds 9% to the list price.',
      trucks:
        'Pallet trucks and stackers from 1.3 to 2.0 tonnes. Electric models ship with a ' +
        'charger and a lithium-ion battery; replacing the battery after the warranty period ' +
        'costs PLN 4,200 net.',
      accessories:
        'Parts that complete a racking installation: beams, protectors, safety mesh and ' +
        'anchor bolts. Held in stock, with lead times from 3 working days.',
    },
    specHeaders: ['Parameter', 'Value'],
    priceLabel: 'List price, net',
    warrantyLabel: 'Warranty',
    leadLabel: 'Lead time',
    termsHeading: 'Commercial terms',
    termsHeaders: ['Order size', 'Discount off list price'],
    terms: (inspection) =>
      `Installation is quoted at 12% of the net value of the racking ordered. The periodic ` +
      `racking inspection, required every ${inspection} under PN-EN 15635, costs PLN 1,490 ` +
      `net per site. VAT of ${VAT_RATE} is added to all prices.`,
    contactHeading: 'Contact',
    footer: `${COMPANY.name} · Product Catalogue 2026 · demonstration document`,
  },
};

export function build(kit, doc, locale) {
  const s = COPY[locale];

  kit.title(
    doc,
    s.title,
    `${COMPANY.name}, ${COMPANY.street}, ${COMPANY.city} · ${COMPANY.web} · ${COMPANY.phone}`,
  );
  kit.para(doc, s.intro);

  for (const line of PRODUCT_LINES) {
    kit.heading(doc, pick(LINES[line], locale), 1);
    kit.para(doc, s.lineIntro[line]);

    for (const product of PRODUCTS.filter((candidate) => candidate.line === line)) {
      kit.heading(doc, `${pick(product.name, locale)} (${product.sku})`, 2);

      const rows = (PRODUCT_SPECS[product.sku] ?? []).map(([label, value]) => [
        pick(label, locale),
        pick(value, locale),
      ]);
      rows.push([
        s.priceLabel,
        `${money(product.price, locale, 2)} / ${pick(product.unit, locale)}`,
      ]);
      rows.push([s.warrantyLabel, months(product.warranty, locale)]);
      rows.push([s.leadLabel, workingDays(product.lead, locale)]);

      kit.table(doc, s.specHeaders, rows, [6.5, 9]);
    }
  }

  kit.heading(doc, s.termsHeading, 1);
  kit.table(
    doc,
    s.termsHeaders,
    DISCOUNTS.map((band) => [pick(band.band, locale), band.discount]),
    [7, 8],
  );
  kit.para(doc, s.terms(pick(SLA_INSPECTION_INTERVAL, locale)));

  kit.heading(doc, s.contactHeading, 1);
  kit.para(
    doc,
    locale === 'pl'
      ? `Zamówienia: ${COMPANY.orders} · Serwis: ${COMPANY.servicePortal} · Centrala: ${COMPANY.phone}`
      : `Orders: ${COMPANY.orders} · Service: ${COMPANY.servicePortal} · Switchboard: ${COMPANY.phone}`,
  );

  kit.footerNote(doc, s.footer);
}
