/** The service agreement: priorities, response times, penalties, the fee. */

import {
  COMPANY,
  SLA_AVAILABILITY_TARGET,
  SLA_FEE_MINIMUM,
  SLA_FEE_PERCENT,
  SLA_INSPECTION_INTERVAL,
  SLA_LEVELS,
  SLA_PENALTY_CAP,
  SLA_PENALTY_PER_HOUR,
} from '../data.mjs';
import { pick } from '../format.mjs';

export const format = 'pdf';

export const file = {
  pl: 'umowa-serwisowa-sla.pdf',
  en: 'service-agreement-sla.pdf',
};

const COPY = {
  pl: {
    title: 'Umowa serwisowa — warunki SLA',
    subtitle: 'załącznik nr 3 do umowy ramowej · wersja 2026.1',
    scope: 'Przedmiot i zakres',
    scopeBody:
      'Umowa obejmuje serwis gwarancyjny i pogwarancyjny wyposażenia magazynowego ' +
      'dostarczonego przez Acme Industries: konstrukcji regałowych, wózków magazynowych ' +
      'oraz akcesoriów. Serwis sprzętu innych producentów nie jest objęty umową.',
    scopeContact: (phone) =>
      `Zgłoszenia przyjmowane są przez portal serwisowy oraz telefonicznie pod numerem ` +
      `${phone}. Każde zgłoszenie otrzymuje numer w formacie SRV/RRRR/NNNN.`,
    levels: 'Poziomy zgłoszeń i czasy reakcji',
    levelHeaders: ['Priorytet', 'Definicja', 'Czas reakcji', 'Czas usunięcia', 'Okno serwisowe'],
    levelsNote1:
      'Czas reakcji liczony jest od momentu rejestracji zgłoszenia w portalu serwisowym. ' +
      'Czas usunięcia nie obejmuje okresu oczekiwania na części zamienne sprowadzane na ' +
      'zamówienie, o ile Dostawca poinformował o tym Klienta w ciągu 24 godzin od diagnozy.',
    levelsNote2:
      'Priorytet zgłoszenia nadaje Klient. Dostawca może go obniżyć wyłącznie za pisemną ' +
      'zgodą Klienta; zgłoszenie dotyczące bezpieczeństwa konstrukcji pozostaje zawsze ' +
      'na priorytecie P1.',
    penalties: 'Kary umowne i dostępność',
    penaltyHeaders: ['Naruszenie', 'Kara umowna', 'Limit'],
    penaltyRows: (perHour, cap, availability) => [
      [`Przekroczenie czasu reakcji P1`, `${perHour} za każdą rozpoczętą godzinę zwłoki`, cap],
      [`Przekroczenie czasu usunięcia P1`, '500 zł za każdą rozpoczętą dobę zwłoki', cap],
      [`Przekroczenie czasu reakcji P2`, '100 zł za każdą rozpoczętą godzinę roboczą zwłoki', cap],
      [
        `Dostępność poniżej ${availability} w kwartale`,
        '5% kwartalnej opłaty serwisowej za każdy rozpoczęty 0,1 punktu procentowego',
        cap,
      ],
    ],
    availability: (target) =>
      `Dostępność serwisu raportowana jest kwartalnie, a cel umowny wynosi ${target}. ` +
      'Raport dostępności Dostawca przekazuje do 10. dnia miesiąca następującego po ' +
      'zakończeniu kwartału.',
    fee: 'Opłata serwisowa',
    feeBody: (percent, minimum) =>
      `Roczna opłata serwisowa wynosi ${percent} wartości netto sprzętu objętego umową, ` +
      `nie mniej niż ${minimum}. Opłata jest fakturowana kwartalnie z góry, w równych ratach, ` +
      'z terminem płatności 30 dni.',
    feeCovers:
      'Opłata obejmuje: przyjmowanie zgłoszeń, diagnozę, robociznę i dojazd technika. ' +
      'Nie obejmuje części zamiennych, które rozliczane są według cennika serwisowego ' +
      'z rabatem 15% dla stron umowy.',
    inspections: 'Przeglądy okresowe',
    inspectionsBody: (interval) =>
      `Przegląd konstrukcji regałowych wykonywany jest co ${interval} zgodnie z normą ` +
      'PN-EN 15635. Z przeglądu sporządzany jest protokół z klasyfikacją uszkodzeń w skali ' +
      'zielona–żółta–czerwona. Element sklasyfikowany jako czerwony wymaga natychmiastowego ' +
      'wyłączenia z eksploatacji i wymiany w ciągu 5 dni roboczych.',
    inspectionsPenalty:
      'Brak wykonanego przeglądu w terminie powoduje utratę gwarancji na konstrukcję ' +
      'i zawieszenie kar umownych po stronie Dostawcy do czasu wykonania przeglądu.',
    exclusions: 'Wyłączenia',
    exclusionList: [
      'uszkodzenia wynikające z przeciążenia konstrukcji ponad nośność z karty produktu,',
      'skutki kolizji z wózkiem widłowym, jeżeli nie zgłoszono ich w ciągu 24 godzin,',
      'modyfikacje konstrukcji wykonane bez pisemnej zgody Dostawcy,',
      'materiały eksploatacyjne: akumulatory, rolki, uszczelki, oświetlenie,',
      'zdarzenia losowe: pożar, zalanie, przepięcie w sieci zasilającej.',
    ],
    term: 'Czas obowiązywania',
    termBody:
      'Umowa serwisowa zawierana jest na 12 miesięcy i przedłuża się automatycznie na kolejne ' +
      '12 miesięcy, jeżeli żadna ze stron nie złoży oświadczenia o jej nieprzedłużaniu ' +
      'na 60 dni przed końcem okresu.',
    footer: `${COMPANY.name} · Warunki SLA 2026.1 · dokument demonstracyjny`,
  },
  en: {
    title: 'Service Agreement — SLA terms',
    subtitle: 'schedule 3 to the framework agreement · version 2026.1',
    scope: 'Subject and scope',
    scopeBody:
      'This agreement covers warranty and post-warranty service for the warehouse equipment ' +
      'supplied by Acme Industries: racking structures, warehouse trucks and accessories. ' +
      'Equipment from other manufacturers is not covered.',
    scopeContact: (phone) =>
      `Tickets are accepted through the service portal and by telephone on ${phone}. ` +
      'Every ticket is given a reference in the form SRV/YYYY/NNNN.',
    levels: 'Ticket priorities and response times',
    levelHeaders: ['Priority', 'Definition', 'Response time', 'Time to fix', 'Service window'],
    levelsNote1:
      'The response time runs from the moment the ticket is registered in the service portal. ' +
      'The time to fix excludes any wait for spare parts ordered in, provided the Supplier ' +
      'told the Customer within 24 hours of diagnosis.',
    levelsNote2:
      'The Customer sets the priority. The Supplier may lower it only with the Customer’s ' +
      'written consent; a ticket concerning structural safety always stays at P1.',
    penalties: 'Liquidated damages and availability',
    penaltyHeaders: ['Breach', 'Liquidated damages', 'Cap'],
    penaltyRows: (perHour, cap, availability) => [
      ['P1 response time exceeded', `${perHour} for each hour started`, cap],
      ['P1 time to fix exceeded', 'PLN 500 for each day started', cap],
      ['P2 response time exceeded', 'PLN 100 for each working hour started', cap],
      [
        `Availability below ${availability} in a quarter`,
        '5% of the quarterly service fee for each 0.1 percentage point started',
        cap,
      ],
    ],
    availability: (target) =>
      `Service availability is reported quarterly against a contractual target of ${target}. ` +
      'The Supplier delivers the availability report by the 10th day of the month following ' +
      'the end of the quarter.',
    fee: 'Service fee',
    feeBody: (percent, minimum) =>
      `The annual service fee is ${percent} of the net value of the equipment covered, and no ` +
      `less than ${minimum}. It is invoiced quarterly in advance, in equal instalments, on ` +
      '30-day payment terms.',
    feeCovers:
      'The fee covers ticket handling, diagnosis, labour and the engineer’s travel. It does ' +
      'not cover spare parts, which are charged at the service price list with a 15% discount ' +
      'for parties to this agreement.',
    inspections: 'Periodic inspections',
    inspectionsBody: (interval) =>
      `Racking structures are inspected every ${interval} in accordance with PN-EN 15635. ` +
      'Each inspection produces a report classifying damage on a green–amber–red scale. ' +
      'An item classified red must be taken out of service immediately and replaced within ' +
      '5 working days.',
    inspectionsPenalty:
      'A missed inspection voids the warranty on the structure and suspends the Supplier’s ' +
      'liquidated damages until the inspection has been carried out.',
    exclusions: 'Exclusions',
    exclusionList: [
      'damage from loading a structure beyond the capacity stated on its product card,',
      'the consequences of a forklift collision not reported within 24 hours,',
      'modifications made to a structure without the Supplier’s written consent,',
      'consumables: batteries, rollers, seals and lighting,',
      'force majeure: fire, flooding, and power surges.',
    ],
    term: 'Term',
    termBody:
      'The service agreement runs for 12 months and renews automatically for a further ' +
      '12 months unless either party gives notice not to renew 60 days before the end of ' +
      'the term.',
    footer: `${COMPANY.name} · SLA terms 2026.1 · demonstration document`,
  },
};

export function build(kit, doc, locale) {
  const s = COPY[locale];

  kit.title(
    doc,
    s.title,
    `${COMPANY.name}, ${COMPANY.street}, ${COMPANY.city} · NIP ${COMPANY.nip} · ${s.subtitle}`,
  );

  kit.heading(doc, `1. ${s.scope}`, 1);
  kit.para(doc, s.scopeBody);
  kit.para(doc, s.scopeContact(COMPANY.phone));

  kit.heading(doc, `2. ${s.levels}`, 1);
  kit.table(
    doc,
    s.levelHeaders,
    SLA_LEVELS.map((level) => [
      pick(level.priority, locale),
      pick(level.definition, locale),
      pick(level.response, locale),
      pick(level.fix, locale),
      pick(level.window, locale),
    ]),
    [2.8, 5.6, 2.6, 2.6, 2.4],
  );
  kit.para(doc, s.levelsNote1);
  kit.para(doc, s.levelsNote2);

  kit.heading(doc, `3. ${s.penalties}`, 1);
  kit.table(
    doc,
    s.penaltyHeaders,
    s.penaltyRows(
      pick(SLA_PENALTY_PER_HOUR, locale),
      pick(SLA_PENALTY_CAP, locale),
      pick(SLA_AVAILABILITY_TARGET, locale),
    ),
    [5, 7, 4],
  );
  kit.para(doc, s.availability(pick(SLA_AVAILABILITY_TARGET, locale)));

  kit.heading(doc, `4. ${s.fee}`, 1);
  kit.para(doc, s.feeBody(pick(SLA_FEE_PERCENT, locale), pick(SLA_FEE_MINIMUM, locale)));
  kit.para(doc, s.feeCovers);

  kit.heading(doc, `5. ${s.inspections}`, 1);
  kit.para(doc, s.inspectionsBody(pick(SLA_INSPECTION_INTERVAL, locale)));
  kit.para(doc, s.inspectionsPenalty);

  kit.heading(doc, `6. ${s.exclusions}`, 1);
  kit.bullets(doc, s.exclusionList);

  kit.heading(doc, `7. ${s.term}`, 1);
  kit.para(doc, s.termBody);

  kit.footerNote(doc, s.footer);
}
