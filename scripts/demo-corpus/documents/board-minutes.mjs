/** Board minutes 2/2026: five resolutions and the action items they created. */

import {
  BOARD,
  COMPANY,
  EBITDA_2025,
  MARKETING_BUDGET_2026,
  PRICE_INCREASE_2026,
  REFERRAL_BONUS,
  REVENUE_2024_TOTAL,
  REVENUE_2025,
  REVENUE_TARGET_2026,
} from '../data.mjs';
import { millions, money, percent, pick } from '../format.mjs';

export const format = 'docx';

export const file = {
  pl: 'protokol-zarzadu-2026-02.docx',
  en: 'board-minutes-2026-02.docx',
};

const COPY = {
  pl: {
    title: 'Protokół z posiedzenia Zarządu',
    subtitle: 'posiedzenie nr 2/2026, Poznań, 12 lutego 2026',
    attendees: 'Uczestnicy',
    attendeeHeaders: ['Imię i nazwisko', 'Funkcja', 'Obecność'],
    opening:
      'Posiedzenie otworzyła Marta Zielińska o godzinie 10:00. Protokołowała Joanna Sikora, ' +
      'asystentka zarządu. Kworum zostało stwierdzone.',
    results: '1. Wyniki 2025',
    resultsBody: (total, previous, ebitda, margin) =>
      `Dyrektor finansowy przedstawiła wyniki roku 2025: przychód ${total} wobec ${previous} ` +
      `w roku 2024, EBITDA ${ebitda}, marża EBITDA ${margin}. Zarząd przyjął wyniki bez uwag.`,
    resolutions: '2. Podjęte uchwały',
    resolutionHeaders: ['Numer', 'Treść uchwały', 'Głosowanie'],
    resolutionRows: (budget, increase, referral) => [
      ['1/2026', `Zatwierdzenie budżetu marketingowego na rok 2026 w wysokości ${budget} netto.`, 'jednogłośnie'],
      ['2/2026', 'Uruchomienie magazynu regionalnego w Gdańsku (M3) z dniem 1 czerwca 2026. Budżet uruchomienia: 2 400 000 zł.', '4 za, 1 wstrzymujący'],
      ['3/2026', `Podwyżka cen katalogowych o ${increase}. Klienci z umowami ramowymi otrzymują zawiadomienie 30 dni przed zmianą.`, 'jednogłośnie'],
      ['4/2026', `Wprowadzenie programu poleceń pracowniczych z premią ${referral} brutto, wypłacaną po 3 miesiącach pracy poleconego kandydata.`, 'jednogłośnie'],
      ['5/2026', 'Zwiększenie budżetu szkoleniowego na pracownika do 4 000 zł rocznie.', 'jednogłośnie'],
    ],
    discussion: '3. Dyskusja',
    discussion1:
      'Tomasz Wrona zwrócił uwagę, że stan magazynowy wózków elektrycznych Rolo-E 2,0 t (WZE-20) ' +
      'spadł poniżej zapasu minimalnego, a czas dostawy od producenta komponentów wynosi 35 dni ' +
      'roboczych. Zarząd zobowiązał go do przedstawienia planu uzupełnienia zapasu ' +
      'do 28 lutego 2026.',
    discussion2: (target) =>
      `Katarzyna Lis przedstawiła cel przychodowy na rok 2026 w wysokości ${target}, z czego 26% ` +
      'ma pochodzić z eksportu. Zarząd przyjął cel do realizacji.',
    actions: '4. Zadania i terminy',
    actionHeaders: ['Zadanie', 'Odpowiedzialny', 'Termin'],
    actionRows: [
      ['Plan uzupełnienia zapasu WZE-20', 'Tomasz Wrona', '28 lutego 2026'],
      ['Zawiadomienia o zmianie cen dla klientów umownych', 'Katarzyna Lis', '1 marca 2026'],
      ['Umowa najmu powierzchni magazynowej w Gdańsku', 'Anna Dąbrowska', '31 marca 2026'],
      ['Regulamin programu poleceń pracowniczych', 'Robert Nowak', '15 marca 2026'],
      ['Rekrutacja 12 osób do magazynu M3', 'Robert Nowak', '30 kwietnia 2026'],
    ],
    closing:
      'Posiedzenie zamknięto o godzinie 12:40. Kolejne posiedzenie zaplanowano na 9 kwietnia 2026.',
    footer: `${COMPANY.name} · Protokół 2/2026 · dokument demonstracyjny`,
  },
  en: {
    title: 'Minutes of the Board Meeting',
    subtitle: 'meeting no. 2/2026, Poznań, 12 February 2026',
    attendees: 'Attendance',
    attendeeHeaders: ['Name', 'Role', 'Attendance'],
    opening:
      'Marta Zielińska opened the meeting at 10:00. Joanna Sikora, board assistant, took the ' +
      'minutes. A quorum was established.',
    results: '1. Results for 2025',
    resultsBody: (total, previous, ebitda, margin) =>
      `The Chief Financial Officer presented the 2025 results: revenue ${total} against ` +
      `${previous} in 2024, EBITDA ${ebitda}, EBITDA margin ${margin}. The board accepted the ` +
      'results without comment.',
    resolutions: '2. Resolutions passed',
    resolutionHeaders: ['Number', 'Resolution', 'Vote'],
    resolutionRows: (budget, increase, referral) => [
      ['1/2026', `Approval of the 2026 marketing budget of ${budget} net.`, 'unanimous'],
      ['2/2026', 'Opening of the regional warehouse in Gdańsk (M3) on 1 June 2026. Set-up budget: PLN 2,400,000.', '4 for, 1 abstention'],
      ['3/2026', `List price increase of ${increase}. Customers on framework agreements receive 30 days' notice of the change.`, 'unanimous'],
      ['4/2026', `Introduction of an employee referral scheme with a bonus of ${referral} gross, paid after the referred hire has worked 3 months.`, 'unanimous'],
      ['5/2026', 'Increase of the training budget to PLN 4,000 per employee per year.', 'unanimous'],
    ],
    discussion: '3. Discussion',
    discussion1:
      'Tomasz Wrona noted that stock of the Rolo-E 2.0 t electric pallet truck (WZE-20) had ' +
      'fallen below its minimum level, while the component manufacturer quotes 35 working days. ' +
      'The board asked him to present a restocking plan by 28 February 2026.',
    discussion2: (target) =>
      `Katarzyna Lis presented a revenue target for 2026 of ${target}, of which 26% is to come ` +
      'from exports. The board adopted the target.',
    actions: '4. Actions and deadlines',
    actionHeaders: ['Action', 'Owner', 'Deadline'],
    actionRows: [
      ['Restocking plan for WZE-20', 'Tomasz Wrona', '28 February 2026'],
      ['Price change notices to contract customers', 'Katarzyna Lis', '1 March 2026'],
      ['Lease for warehouse space in Gdańsk', 'Anna Dąbrowska', '31 March 2026'],
      ['Rules of the employee referral scheme', 'Robert Nowak', '15 March 2026'],
      ['Recruitment of 12 people for the M3 warehouse', 'Robert Nowak', '30 April 2026'],
    ],
    closing: 'The meeting closed at 12:40. The next meeting is set for 9 April 2026.',
    footer: `${COMPANY.name} · Minutes 2/2026 · demonstration document`,
  },
};

export function build(kit, doc, locale) {
  const s = COPY[locale];
  const total = Object.values(REVENUE_2025).reduce((sum, value) => sum + value, 0);

  kit.title(
    doc,
    s.title,
    `${COMPANY.name}, ${COMPANY.street}, ${COMPANY.city} · NIP ${COMPANY.nip} · ${s.subtitle}`,
  );

  kit.heading(doc, s.attendees, 2);
  kit.table(
    doc,
    s.attendeeHeaders,
    BOARD.map((member) => [member.name, pick(member.role, locale), pick(member.present, locale)]),
    [5.5, 7, 3.5],
  );
  kit.para(doc, s.opening);

  kit.heading(doc, s.results, 2);
  kit.para(
    doc,
    s.resultsBody(
      millions(total, locale),
      millions(REVENUE_2024_TOTAL, locale),
      millions(EBITDA_2025, locale),
      percent(EBITDA_2025 / total, locale),
    ),
  );

  kit.heading(doc, s.resolutions, 2);
  kit.table(
    doc,
    s.resolutionHeaders,
    s.resolutionRows(
      money(MARKETING_BUDGET_2026, locale),
      pick(PRICE_INCREASE_2026, locale),
      pick(REFERRAL_BONUS, locale),
    ),
    [2.2, 9.3, 4.5],
  );

  kit.heading(doc, s.discussion, 2);
  kit.para(doc, s.discussion1);
  kit.para(doc, s.discussion2(pick(REVENUE_TARGET_2026, locale)));

  kit.heading(doc, s.actions, 2);
  kit.table(doc, s.actionHeaders, s.actionRows, [8, 4.5, 3.5]);

  kit.para(doc, s.closing);
  kit.footerNote(doc, s.footer);
}
