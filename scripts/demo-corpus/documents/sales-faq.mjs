/**
 * The sales FAQ: twelve questions, each answer naming its source document.
 *
 * The most useful document in the corpus for a demo, because every answer
 * crosses two others — so a question about it shows retrieval pulling a fact
 * out of a document that quotes a document.
 */

import {
  COMPANY,
  PAYMENT_DAYS,
  PRICE_INCREASE_2026,
  SLA_FEE_MINIMUM,
  SLA_FEE_PERCENT,
  SLA_INSPECTION_INTERVAL,
  SLA_LEVELS,
} from '../data.mjs';
import { pick } from '../format.mjs';

export const format = 'docx';

export const file = {
  pl: 'faq-dzial-handlowy.docx',
  en: 'sales-faq.docx',
};

const COPY = {
  pl: {
    title: 'FAQ dla działu handlowego',
    subtitle: 'aktualizacja: 1 marca 2026',
    intro:
      'Odpowiedzi na pytania, które najczęściej zadają klienci. Każda odpowiedź wskazuje ' +
      'dokument źródłowy — w razie wątpliwości obowiązuje treść dokumentu, nie tego zestawienia.',
    questions: (v) => [
      [
        'Jaki rabat dostanie klient przy zamówieniu 60 sztuk jednego produktu?',
        '12%. Próg 50–99 sztuk liczy się osobno dla każdej pozycji zamówienia, a nie dla wartości ' +
          'całego zamówienia. Klient z umową ramową i obrotem powyżej 2 mln zł w poprzednim roku ' +
          'dostaje dodatkowo 3% rabatu lojalnościowego. Źródło: cennik 2026, arkusz „Rabaty ' +
          'i warunki”, oraz § 3 umowy ramowej.',
      ],
      [
        'Ile wynosi termin płatności i czy można go wydłużyć?',
        `Standardowo ${v.paymentDays} dni od daty wystawienia faktury. Wydłużenie do 45 dni ` +
          'wymaga zgody dyrektora finansowego i jest możliwe wyłącznie dla klientów bez ' +
          'zaległości w ostatnich 12 miesiącach. Źródło: § 5 umowy ramowej.',
      ],
      [
        'Kiedy transport jest bezpłatny?',
        'Przy zamówieniu powyżej 15 000 zł netto. Poniżej tej kwoty koszt transportu wycenia ' +
          'dział logistyki według adresu dostawy. Minimum logistyczne to 2 500 zł netto ' +
          'na zamówienie. Źródło: cennik 2026 i § 4 umowy ramowej.',
      ],
      [
        'Jak długa jest gwarancja?',
        '24 miesiące na konstrukcje regałowe, 12 miesięcy na wózki magazynowe i akcesoria. ' +
          `Gwarancja na regały wymaga udokumentowanego przeglądu okresowego co ${v.inspection}. ` +
          'Źródło: § 6 umowy ramowej.',
      ],
      [
        'Ile kosztuje umowa serwisowa?',
        `${v.slaPercent} wartości sprzedanego sprzętu w skali roku, nie mniej niż ${v.slaMinimum}. ` +
          'Umowa obejmuje trzy poziomy zgłoszeń: P1, P2 i P3. Źródło: umowa serwisowa SLA, ' +
          'rozdział 4.',
      ],
      [
        'Jaki jest czas reakcji na awarię krytyczną?',
        `${v.p1Response} w trybie ${v.p1Window}, a usunięcie awarii ${v.p1Fix}. Za każdą ` +
          'rozpoczętą godzinę zwłoki w reakcji P1 klientowi przysługuje kara umowna. ' +
          'Źródło: umowa serwisowa SLA, rozdział 2.',
      ],
      [
        'Klient zgłasza wadę po pięciu miesiącach od dostawy — czy to reklamacja?',
        'Tak, jeżeli jest to wada ukryta i produkt jest w okresie gwarancji. Termin zgłoszenia ' +
          'to 14 dni od wykrycia wady. Wady jawne zgłasza się w ciągu 7 dni od dostawy. ' +
          'Źródło: procedura reklamacyjna P-07, rozdział 2.',
      ],
      [
        'W jakim czasie rozpatrujemy reklamację?',
        '14 dni kalendarzowych od zgłoszenia. Brak decyzji w tym terminie oznacza uznanie ' +
          'reklamacji. Naprawa lub wymiana następuje w ciągu 21 dni od uznania. ' +
          'Źródło: procedura reklamacyjna P-07, rozdział 3.',
      ],
      [
        'Czy możemy obiecać dostawę wózka elektrycznego w dwa tygodnie?',
        'Nie. Czas dostawy WZE-20 wynosi 35 dni roboczych, a stan magazynowy tego modelu jest ' +
          'poniżej zapasu minimalnego. Przed złożeniem deklaracji sprawdź arkusz stanów ' +
          'magazynowych. Źródło: cennik 2026 i zestawienie stanów magazynowych.',
      ],
      [
        'Kiedy rusza magazyn w Gdańsku?',
        '1 czerwca 2026, zgodnie z uchwałą zarządu nr 2/2026. Do tego czasu klienci z Pomorza ' +
          'obsługiwani są z magazynu M1 w Poznaniu. Źródło: protokół posiedzenia zarządu nr 2/2026.',
      ],
      [
        'Od kiedy obowiązują nowe ceny?',
        `Podwyżka cen katalogowych: ${v.priceIncrease}. Klienci z umowami ramowymi muszą ` +
          'otrzymać zawiadomienie 30 dni przed zmianą — listę prowadzi dział handlowy. ' +
          'Źródło: uchwała 3/2026 i § 3 umowy ramowej.',
      ],
      [
        'Jaka jest kara za opóźnioną dostawę?',
        '0,2% wartości netto opóźnionej dostawy za każdy dzień zwłoki, nie więcej niż 15% ' +
          'wartości zamówienia. Źródło: § 7 umowy ramowej.',
      ],
    ],
    neverHeading: 'Czego nie wolno obiecywać',
    neverList: [
      'rabatu powyżej 15% bez pisemnej zgody dyrektora handlowego,',
      'terminu dostawy krótszego niż podany w cenniku,',
      'montażu w cenie produktu — montaż to 12% wartości netto regałów,',
      'wydłużenia gwarancji ponad okres z umowy ramowej,',
      'objęcia umową serwisową sprzętu innego producenta.',
    ],
    footer: `${COMPANY.name} · FAQ handlowe · dokument demonstracyjny`,
  },
  en: {
    title: 'Sales FAQ',
    subtitle: 'last updated: 1 March 2026',
    intro:
      'Answers to the questions customers ask most often. Each answer names its source ' +
      'document — where they differ, the document governs, not this summary.',
    questions: (v) => [
      [
        'What discount does a customer get on an order of 60 units of one product?',
        '12%. The 50–99 band is applied per order line, not to the value of the whole order. ' +
          'A customer on a framework agreement with over PLN 2 million of orders in the previous ' +
          'year also gets a 3% loyalty discount. Source: price list 2026, "Discounts and terms" ' +
          'sheet, and section 3 of the framework agreement.',
      ],
      [
        'What are the payment terms, and can they be extended?',
        `${v.paymentDays} days from the invoice date as standard. An extension to 45 days needs ` +
          'the Chief Financial Officer’s approval and is only possible for customers with no ' +
          'arrears in the last 12 months. Source: section 5 of the framework agreement.',
      ],
      [
        'When is transport free of charge?',
        'On orders above PLN 15,000 net. Below that, logistics quotes the transport cost from the ' +
          'delivery address. The minimum order value is PLN 2,500 net. Source: price list 2026 ' +
          'and section 4 of the framework agreement.',
      ],
      [
        'How long is the warranty?',
        '24 months on racking structures, 12 months on warehouse trucks and accessories. The ' +
          `warranty on racking requires a documented periodic inspection every ${v.inspection}. ` +
          'Source: section 6 of the framework agreement.',
      ],
      [
        'What does a service agreement cost?',
        `${v.slaPercent} of the value of the equipment sold, per year, and no less than ` +
          `${v.slaMinimum}. It covers three ticket priorities: P1, P2 and P3. Source: SLA terms, ` +
          'chapter 4.',
      ],
      [
        'What is the response time for a critical failure?',
        `${v.p1Response}, ${v.p1Window}, with a fix within ${v.p1Fix}. Every hour started beyond ` +
          'the P1 response time earns the customer liquidated damages. Source: SLA terms, chapter 2.',
      ],
      [
        'A customer reports a defect five months after delivery — is that a valid complaint?',
        'Yes, if it is a latent defect and the product is within its warranty. It must be filed ' +
          'within 14 days of discovery. Apparent defects are filed within 7 days of delivery. ' +
          'Source: complaints procedure P-07, chapter 2.',
      ],
      [
        'How long do we have to assess a complaint?',
        '14 calendar days from filing. No decision within that period means the complaint is ' +
          'accepted. Repair or replacement follows within 21 days of acceptance. Source: ' +
          'complaints procedure P-07, chapter 3.',
      ],
      [
        'Can we promise an electric pallet truck in two weeks?',
        'No. The lead time on WZE-20 is 35 working days and stock of that model is below its ' +
          'minimum level. Check the stock report before committing to a date. Source: price list ' +
          '2026 and the stock report.',
      ],
      [
        'When does the Gdańsk warehouse open?',
        '1 June 2026, under board resolution 2/2026. Until then, customers in Pomerania are ' +
          'served from the M1 warehouse in Poznań. Source: minutes of board meeting 2/2026.',
      ],
      [
        'When do the new prices take effect?',
        `The list price increase is ${v.priceIncrease}. Customers on framework agreements must be ` +
          'given 30 days’ notice of the change — sales keeps the list. Source: resolution ' +
          '3/2026 and section 3 of the framework agreement.',
      ],
      [
        'What are the damages for a late delivery?',
        '0.2% of the net value of the late delivery per day, capped at 15% of the order value. ' +
          'Source: section 7 of the framework agreement.',
      ],
    ],
    neverHeading: 'What never to promise',
    neverList: [
      'a discount above 15% without the Sales Director’s written approval,',
      'a lead time shorter than the one in the price list,',
      'installation included in the price — installation is 12% of the net racking value,',
      'a warranty longer than the framework agreement allows,',
      "service cover for another manufacturer's equipment.",
    ],
    footer: `${COMPANY.name} · Sales FAQ · demonstration document`,
  },
};

export function build(kit, doc, locale) {
  const s = COPY[locale];
  const p1 = SLA_LEVELS[0];

  const values = {
    paymentDays: PAYMENT_DAYS,
    inspection: pick(SLA_INSPECTION_INTERVAL, locale),
    slaPercent: pick(SLA_FEE_PERCENT, locale),
    slaMinimum: pick(SLA_FEE_MINIMUM, locale),
    p1Response: pick(p1.response, locale),
    p1Fix: pick(p1.fix, locale),
    p1Window: pick(p1.window, locale),
    priceIncrease: pick(PRICE_INCREASE_2026, locale),
  };

  kit.title(
    doc,
    s.title,
    `${COMPANY.name}, ${COMPANY.street}, ${COMPANY.city} · NIP ${COMPANY.nip} · ${s.subtitle}`,
  );
  kit.para(doc, s.intro);

  for (const [question, answer] of s.questions(values)) {
    kit.heading(doc, question, 2);
    kit.para(doc, answer);
  }

  kit.heading(doc, s.neverHeading, 2);
  kit.bullets(doc, s.neverList);

  kit.footerNote(doc, s.footer);
}
