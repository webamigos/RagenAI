/** The framework supply agreement: orders, prices, delivery, payment, penalties. */

import { COMPANY, DISCOUNTS, PAYMENT_DAYS, PRICE_INCREASE_2026, SLA_INSPECTION_INTERVAL } from '../data.mjs';
import { pick } from '../format.mjs';

export const format = 'docx';

export const file = {
  pl: 'umowa-ramowa-dostawy.docx',
  en: 'framework-supply-agreement.docx',
};

const COPY = {
  pl: {
    title: 'Umowa ramowa dostawy nr 04/2026',
    subtitle: 'zawarta w Poznaniu 15 stycznia 2026 roku',
    partyA:
      `zawarta pomiędzy Acme Industries sp. z o.o. z siedzibą w Poznaniu przy ul. Kwiatowej 7, ` +
      `wpisaną do rejestru przedsiębiorców KRS pod numerem ${COMPANY.krs}, NIP ${COMPANY.nip}, ` +
      'reprezentowaną przez Martę Zielińską — Prezesa Zarządu, zwaną dalej Dostawcą,',
    partyB:
      'a Logistyka Wielkopolska S.A. z siedzibą w Swarzędzu przy ul. Składowej 22, ' +
      'NIP 7773012988, reprezentowaną przez Piotra Malinowskiego — Członka Zarządu, ' +
      'zwaną dalej Odbiorcą.',
    clause: (number, name) => `§ ${number}. ${name}`,
    subject: 'Przedmiot umowy',
    subjectBody:
      'Dostawca zobowiązuje się do sprzedaży i dostarczania Odbiorcy wyposażenia magazynowego ' +
      'z aktualnej oferty katalogowej, a Odbiorca do jego odbioru i zapłaty ceny. Umowa określa ' +
      'warunki ramowe; sprzedaż następuje na podstawie zamówień jednostkowych.',
    orders: 'Zamówienia',
    orderItems: (email) => [
      `Zamówienia składa się drogą elektroniczną na adres ${email}.`,
      'Dostawca potwierdza przyjęcie zamówienia w terminie 2 dni roboczych. Brak potwierdzenia ' +
        'w tym terminie oznacza nieprzyjęcie zamówienia.',
      'Minimalna wartość jednego zamówienia wynosi 2 500 zł netto.',
      'Zmiana lub anulowanie potwierdzonego zamówienia wymaga zgody Dostawcy i jest bezpłatna ' +
        'do 3 dni roboczych od potwierdzenia.',
    ],
    prices: 'Ceny i rabaty',
    pricesBody: (increase) =>
      'Ceny określa cennik stanowiący załącznik nr 1 do umowy. Dostawca może zmienić ceny ' +
      'katalogowe nie częściej niż raz na 6 miesięcy, zawiadamiając Odbiorcę na 30 dni przed ' +
      `zmianą. Zaplanowana zmiana cen: ${increase}.`,
    discountsIntro: 'Rabaty progowe liczone są osobno dla każdej pozycji zamówienia:',
    discountHeaders: ['Wielkość zamówienia', 'Rabat'],
    loyalty:
      'Odbiorcy przysługuje dodatkowy rabat lojalnościowy w wysokości 3% od cen katalogowych, ' +
      'jeżeli wartość zamówień w poprzednim roku kalendarzowym przekroczyła 2 000 000 zł netto. ' +
      'Rabaty nie sumują się z rabatami promocyjnymi.',
    delivery: 'Dostawa',
    deliveryItems: [
      'Termin dostawy wynosi 14 dni roboczych od potwierdzenia zamówienia, chyba że karta ' +
        'produktu przewiduje termin dłuższy.',
      'Dostawa następuje na warunkach DAP zgodnie z Incoterms 2020, do magazynu Odbiorcy ' +
        'wskazanego w zamówieniu.',
      'Transport jest bezpłatny dla zamówień o wartości powyżej 15 000 zł netto.',
      'Odbiorca sprawdza zgodność dostawy w chwili odbioru i zgłasza braki ilościowe ' +
        'w protokole odbioru.',
    ],
    payments: 'Płatności',
    paymentsBody: (days) =>
      `Termin płatności wynosi ${days} dni od daty wystawienia faktury. Za dzień zapłaty uznaje ` +
      'się dzień uznania rachunku Dostawcy. W razie opóźnienia Dostawcy przysługują odsetki ' +
      'ustawowe za opóźnienie w transakcjach handlowych.',
    credit:
      'Limit kredytu kupieckiego Odbiorcy wynosi 600 000 zł. Po jego przekroczeniu Dostawca może ' +
      'wstrzymać realizację kolejnych zamówień do czasu uregulowania zaległości.',
    warranty: 'Gwarancja',
    warrantyBody: (interval) =>
      'Dostawca udziela gwarancji na okres 24 miesięcy na konstrukcje regałowe oraz 12 miesięcy ' +
      'na wózki magazynowe i akcesoria, licząc od daty dostawy. Warunkiem utrzymania gwarancji ' +
      `na regały jest wykonanie przeglądu okresowego co ${interval} zgodnie z normą PN-EN 15635.`,
    penalties: 'Kary umowne',
    penaltyHeaders: ['Zdarzenie', 'Kara umowna', 'Limit'],
    penaltyRows: [
      ['Zwłoka w dostawie', '0,2% wartości netto opóźnionej dostawy za każdy dzień', '15% wartości zamówienia'],
      ['Zwłoka w usunięciu wady', '0,1% wartości netto wadliwego towaru za każdy dzień', '10% wartości zamówienia'],
      ['Odstąpienie z winy strony', '10% wartości niezrealizowanej części umowy', '—'],
      ['Naruszenie poufności', '50 000 zł za każde naruszenie', '—'],
    ],
    liability:
      'Łączna odpowiedzialność Dostawcy z tytułu umowy nie przekracza 100% wartości zamówień ' +
      'zrealizowanych w ostatnich 12 miesiącach.',
    confidentiality: 'Poufność i dane osobowe',
    confidentialityBody:
      'Strony zachowują w poufności informacje handlowe i techniczne uzyskane w związku z umową, ' +
      'przez czas jej obowiązywania i 3 lata po jej zakończeniu. Powierzenie przetwarzania danych ' +
      'osobowych reguluje załącznik nr 2 (umowa powierzenia zgodna z RODO).',
    term: 'Czas trwania i wypowiedzenie',
    termBody:
      'Umowa zostaje zawarta na 24 miesiące, z możliwością przedłużenia na kolejne 12 miesięcy ' +
      'w drodze aneksu. Każda ze stron może ją wypowiedzieć z zachowaniem 3-miesięcznego okresu ' +
      'wypowiedzenia ze skutkiem na koniec miesiąca kalendarzowego. Zamówienia potwierdzone ' +
      'przed wypowiedzeniem są realizowane na dotychczasowych warunkach.',
    final: 'Postanowienia końcowe',
    finalBody:
      'Zmiany umowy wymagają formy pisemnej pod rygorem nieważności. Spory rozstrzyga sąd ' +
      'właściwy dla siedziby Dostawcy w Poznaniu. W sprawach nieuregulowanych stosuje się ' +
      'przepisy Kodeksu cywilnego.',
    attachments:
      'Załączniki: nr 1 — cennik 2026; nr 2 — umowa powierzenia przetwarzania danych; ' +
      'nr 3 — warunki SLA.',
    footer: `${COMPANY.name} · Umowa ramowa dostawy nr 04/2026 · dokument demonstracyjny`,
  },
  en: {
    title: 'Framework Supply Agreement no. 04/2026',
    subtitle: 'made in Poznań on 15 January 2026',
    partyA:
      `between Acme Industries sp. z o.o., registered office in Poznań at ul. Kwiatowa 7, ` +
      `entered in the register of entrepreneurs under KRS ${COMPANY.krs}, NIP ${COMPANY.nip}, ` +
      'represented by Marta Zielińska, Chief Executive Officer, hereinafter the Supplier,',
    partyB:
      'and Logistyka Wielkopolska S.A., registered office in Swarzędz at ul. Składowa 22, ' +
      'NIP 7773012988, represented by Piotr Malinowski, Board Member, hereinafter the Customer.',
    clause: (number, name) => `Section ${number}. ${name}`,
    subject: 'Subject of the agreement',
    subjectBody:
      'The Supplier undertakes to sell and deliver warehouse equipment from its current ' +
      'catalogue to the Customer, and the Customer to take delivery and pay for it. This ' +
      'agreement sets the framework; sales are made under individual orders.',
    orders: 'Orders',
    orderItems: (email) => [
      `Orders are placed by email to ${email}.`,
      'The Supplier confirms an order within 2 working days. No confirmation within that period ' +
        'means the order has not been accepted.',
      'The minimum value of a single order is PLN 2,500 net.',
      'Changing or cancelling a confirmed order requires the Supplier’s consent and is free ' +
        'of charge up to 3 working days after confirmation.',
    ],
    prices: 'Prices and discounts',
    pricesBody: (increase) =>
      'Prices are set by the price list in schedule 1. The Supplier may change list prices no ' +
      'more than once every 6 months, giving the Customer 30 days’ notice. The scheduled ' +
      `price change is ${increase}.`,
    discountsIntro: 'Volume discounts are calculated separately for each order line:',
    discountHeaders: ['Order size', 'Discount'],
    loyalty:
      'The Customer receives an additional loyalty discount of 3% off list prices where orders ' +
      'in the previous calendar year exceeded PLN 2,000,000 net. Discounts do not stack with ' +
      'promotional discounts.',
    delivery: 'Delivery',
    deliveryItems: [
      'The delivery time is 14 working days from order confirmation, unless the product card ' +
        'states a longer time.',
      'Delivery is made DAP under Incoterms 2020, to the Customer warehouse named in the order.',
      'Transport is free of charge for orders above PLN 15,000 net.',
      'The Customer checks the delivery on receipt and records any shortfall in the delivery note.',
    ],
    payments: 'Payment',
    paymentsBody: (days) =>
      `Payment terms are ${days} days from the invoice date. Payment is treated as made on the ` +
      'day the Supplier’s account is credited. Late payment carries statutory interest for ' +
      'late payment in commercial transactions.',
    credit:
      'The Customer’s trade credit limit is PLN 600,000. Above that limit the Supplier may ' +
      'hold further orders until the arrears are settled.',
    warranty: 'Warranty',
    warrantyBody: (interval) =>
      'The Supplier warrants racking structures for 24 months and warehouse trucks and ' +
      'accessories for 12 months from the delivery date. The warranty on racking is conditional ' +
      `on a periodic inspection every ${interval} in accordance with PN-EN 15635.`,
    penalties: 'Liquidated damages',
    penaltyHeaders: ['Event', 'Liquidated damages', 'Cap'],
    penaltyRows: [
      ['Late delivery', '0.2% of the net value of the late delivery per day', '15% of the order value'],
      ['Late remedy of a defect', '0.1% of the net value of the defective goods per day', '10% of the order value'],
      ['Withdrawal through a party’s fault', '10% of the unperformed part of the agreement', '—'],
      ['Breach of confidentiality', 'PLN 50,000 per breach', '—'],
    ],
    liability:
      'The Supplier’s total liability under this agreement does not exceed 100% of the value ' +
      'of orders fulfilled in the last 12 months.',
    confidentiality: 'Confidentiality and personal data',
    confidentialityBody:
      'The parties keep confidential the commercial and technical information obtained under ' +
      'this agreement, for its term and 3 years afterwards. The processing of personal data is ' +
      'governed by schedule 2 (a GDPR data processing agreement).',
    term: 'Term and termination',
    termBody:
      'This agreement is made for 24 months and may be extended by a further 12 months by ' +
      'amendment. Either party may terminate it on 3 months’ notice with effect at the end ' +
      'of a calendar month. Orders confirmed before termination are fulfilled on the existing ' +
      'terms.',
    final: 'Final provisions',
    finalBody:
      'Amendments to this agreement must be in writing to be valid. Disputes are settled by the ' +
      'court with jurisdiction over the Supplier’s registered office in Poznań. Matters not ' +
      'covered here are governed by the Polish Civil Code.',
    attachments:
      'Schedules: 1 — price list 2026; 2 — data processing agreement; 3 — SLA terms.',
    footer: `${COMPANY.name} · Framework Supply Agreement no. 04/2026 · demonstration document`,
  },
};

export function build(kit, doc, locale) {
  const s = COPY[locale];

  kit.title(
    doc,
    s.title,
    `${COMPANY.name}, ${COMPANY.street}, ${COMPANY.city} · NIP ${COMPANY.nip} · ${s.subtitle}`,
  );
  kit.para(doc, s.partyA);
  kit.para(doc, s.partyB);

  kit.heading(doc, s.clause(1, s.subject), 2);
  kit.para(doc, s.subjectBody);

  kit.heading(doc, s.clause(2, s.orders), 2);
  kit.numbered(doc, s.orderItems(COMPANY.orders));

  kit.heading(doc, s.clause(3, s.prices), 2);
  kit.para(doc, s.pricesBody(pick(PRICE_INCREASE_2026, locale)));
  kit.para(doc, s.discountsIntro);
  kit.table(
    doc,
    s.discountHeaders,
    DISCOUNTS.map((band) => [pick(band.band, locale), band.discount]),
    [8, 4],
  );
  kit.para(doc, s.loyalty);

  kit.heading(doc, s.clause(4, s.delivery), 2);
  kit.numbered(doc, s.deliveryItems);

  kit.heading(doc, s.clause(5, s.payments), 2);
  kit.para(doc, s.paymentsBody(PAYMENT_DAYS));
  kit.para(doc, s.credit);

  kit.heading(doc, s.clause(6, s.warranty), 2);
  kit.para(doc, s.warrantyBody(pick(SLA_INSPECTION_INTERVAL, locale)));

  kit.heading(doc, s.clause(7, s.penalties), 2);
  kit.table(doc, s.penaltyHeaders, s.penaltyRows, [5, 7, 4.5]);
  kit.para(doc, s.liability);

  kit.heading(doc, s.clause(8, s.confidentiality), 2);
  kit.para(doc, s.confidentialityBody);

  kit.heading(doc, s.clause(9, s.term), 2);
  kit.para(doc, s.termBody);

  kit.heading(doc, s.clause(10, s.final), 2);
  kit.para(doc, s.finalBody);
  kit.para(doc, s.attachments);

  kit.footerNote(doc, s.footer);
}
