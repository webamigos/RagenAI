/**
 * The staff handbook.
 *
 * Deliberately states the same HR rules as the markdown in
 * `scripts/test-env/sample-docs` — remote days, the allowance, leave, travel
 * limits — so uploading both corpora into one knowledge base gives a working
 * cross-language demo rather than a contradiction.
 */

import { COMPANY, REFERRAL_BONUS } from '../data.mjs';
import { pick } from '../format.mjs';

export const format = 'pdf';

export const file = {
  pl: 'regulamin-pracowniczy-2026.pdf',
  en: 'employee-handbook-2026.pdf',
};

const COPY = {
  pl: {
    title: 'Regulamin pracowniczy 2026',
    subtitle: 'obowiązuje wszystkich pracowników · aktualizacja 1 marca 2026',
    intro:
      'Regulamin zbiera zasady obowiązujące każdego pracownika Acme Industries. Prowadzi go ' +
      'dział personalny. W sprawach nieuregulowanych stosuje się przepisy Kodeksu pracy.',
    time: 'Czas pracy',
    timeBody:
      'Norma czasu pracy wynosi 8 godzin na dobę i 40 godzin tygodniowo, od poniedziałku do ' +
      'piątku. Godziny podstawowej obecności, kiedy pracownik ma być dostępny, to 9:00–15:00. ' +
      'Nadgodziny wymagają wcześniejszej zgody przełożonego i są rozliczane czasem wolnym ' +
      'w stosunku 1:1 w tym samym okresie rozliczeniowym albo wypłacane zgodnie z Kodeksem pracy.',
    remote: 'Praca zdalna',
    remoteBody:
      'Pracownicy biurowi mogą wykonywać pracę zdalną przez maksymalnie 12 dni w miesiącu ' +
      'kalendarzowym. Wniosek składa się w systemie Workday najpóźniej na 3 dni robocze przed ' +
      'planowanym dniem, a przełożony rozpatruje go w ciągu 24 godzin. Stanowiska magazynowe ' +
      'i produkcyjne są wyłączone.',
    remoteAllowance:
      'Pracownikowi wykonującemu pracę zdalną przysługuje ryczałt 180 zł miesięcznie na pokrycie ' +
      'kosztów energii elektrycznej i internetu, wypłacany razem z wynagrodzeniem.',
    leave: 'Urlopy',
    leaveHeaders: ['Rodzaj urlopu', 'Wymiar', 'Zgłoszenie'],
    leaveRows: [
      ['Urlop wypoczynkowy — staż powyżej 10 lat', '26 dni roboczych', '14 dni przy nieobecności dłuższej niż 5 dni'],
      ['Urlop wypoczynkowy — staż poniżej 10 lat', '20 dni roboczych', '14 dni przy nieobecności dłuższej niż 5 dni'],
      ['Urlop na żądanie', '4 dni w roku', 'w dniu rozpoczęcia, do 9:00'],
      ['Urlop bezpłatny powyżej 30 dni', 'na wniosek', 'pisemna zgoda dyrektora personalnego'],
      ['Dzień wolontariatu', '1 dzień w roku', '7 dni'],
    ],
    leaveNote:
      'Niewykorzystany urlop wypoczynkowy przechodzi na rok następny i musi zostać wykorzystany ' +
      'do 30 września.',
    benefits: 'Świadczenia',
    benefitHeaders: ['Świadczenie', 'Co pokrywa firma', 'Dopłata pracownika'],
    benefitRows: (referral) => [
      ['Opieka medyczna (Medicover)', 'pełny koszt dla pracownika', '95 zł miesięcznie za pakiet rodzinny'],
      ['Karta Multisport', '120 zł miesięcznie', '60 zł miesięcznie'],
      ['Ubezpieczenie na życie', 'pełny koszt', 'brak'],
      ['Budżet szkoleniowy', '4 000 zł na pracownika rocznie', 'brak'],
      ['Dni na naukę', '4 płatne dni w roku', 'brak'],
      ['Premia za polecenie', `${referral} po 3 miesiącach pracy poleconego`, 'brak'],
    ],
    benefitNote:
      'Budżet szkoleniowy obejmuje kursy, certyfikaty i bilety konferencyjne związane ze ' +
      'stanowiskiem. Wydatek powyżej 2 000 zł wymaga zgody dyrektora.',
    expenses: 'Koszty i podróże służbowe',
    expensesBody:
      'Wniosek o zwrot kosztów składa się w systemie Expensify w terminie 30 dni od zakończenia ' +
      'podróży; wnioski złożone później nie są rozpatrywane. Wymagana jest faktura VAT ' +
      'wystawiona na Acme Industries sp. z o.o. — sam paragon nie wystarczy.',
    expenseHeaders: ['Pozycja', 'Limit'],
    expenseRows: [
      ['Nocleg w kraju', '450 zł za dobę'],
      ['Nocleg za granicą', '140 euro za dobę'],
      ['Dieta krajowa', '45 zł za dobę'],
      ['Przejazd samochodem prywatnym', '1,15 zł za kilometr'],
    ],
    expensesNote: 'Zwrot następuje w ciągu 14 dni od zatwierdzenia wniosku przez przełożonego.',
    onboarding: 'Onboarding',
    onboardingBody:
      'Nowy pracownik pierwszego dnia otrzymuje laptopa, identyfikator i konto poczty firmowej; ' +
      'konto zakłada dział IT najpóźniej dzień przed pierwszym dniem pracy. Szkolenie BHP trwa ' +
      '4 godziny, a szkolenie z ochrony danych osobowych 2 godziny — oba w pierwszym tygodniu. ' +
      'Każdemu nowemu pracownikowi przydzielany jest opiekun na 3 miesiące, spotykający się ' +
      'z nim co najmniej raz w tygodniu. Okres próbny trwa 3 miesiące, a rozmowa podsumowująca ' +
      'odbywa się w 11 tygodniu.',
    conduct: 'Zasady postępowania i sygnaliści',
    conductBody:
      'Acme Industries nie toleruje mobbingu, dyskryminacji ani jakiejkolwiek formy korupcji. ' +
      'Upominek od kontrahenta o wartości powyżej 200 zł zgłasza się do osoby odpowiedzialnej ' +
      'za zgodność i wpisuje do rejestru upominków.',
    conductWhistle:
      'Zgłoszenia można składać anonimowo przez kanał sygnalistów pod adresem ' +
      'sygnalista.acme-industries.pl. Potwierdzenie przyjęcia następuje w ciągu 7 dni, ' +
      'a rozpatrzenie w ciągu 3 miesięcy. Działania odwetowe wobec osoby zgłaszającej w dobrej ' +
      'wierze stanowią ciężkie naruszenie obowiązków pracowniczych.',
    security: 'Bezpieczeństwo informacji',
    securityList: [
      'dane firmowe przechowujemy wyłącznie w systemach firmowych — nie na prywatnych dyskach w chmurze,',
      'laptopy są szyfrowane, a ekran blokuje się po 5 minutach bezczynności,',
      'hasła trzymamy w firmowym menedżerze haseł i nigdy ich nie udostępniamy,',
      'zgubione urządzenie zgłaszamy do działu IT w ciągu 24 godzin,',
      'dane klientów opuszczają firmę tylko na podstawie podpisanej umowy powierzenia.',
    ],
    footer: `${COMPANY.name} · Regulamin pracowniczy 2026 · dokument demonstracyjny`,
  },
  en: {
    title: 'Employee Handbook 2026',
    subtitle: 'applies to every employee · last updated 1 March 2026',
    intro:
      'This handbook collects the rules that apply to every Acme Industries employee. It is ' +
      'maintained by the HR department. Where it is silent, the Polish Labour Code applies.',
    time: 'Working time',
    timeBody:
      'Standard working time is 8 hours a day and 40 hours a week, Monday to Friday. Core ' +
      'hours, when everyone is expected to be reachable, are 9:00 to 15:00. Overtime is ' +
      'approved in advance by the line manager and is compensated with time off at a 1:1 ratio ' +
      'within the same settlement period, or paid according to the Labour Code.',
    remote: 'Remote work',
    remoteBody:
      'Office-based employees may work remotely for up to 12 days per calendar month. Requests ' +
      'are submitted in Workday at least 3 working days in advance and the manager answers ' +
      'within 24 hours. Warehouse and production roles are excluded.',
    remoteAllowance:
      'A monthly allowance of PLN 180 covers electricity and internet costs for employees who ' +
      'work remotely. It is paid together with the monthly salary.',
    leave: 'Leave',
    leaveHeaders: ['Type of leave', 'Entitlement', 'Notice'],
    leaveRows: [
      ['Annual leave — over 10 years of service', '26 working days', '14 days for absences longer than 5 days'],
      ['Annual leave — under 10 years of service', '20 working days', '14 days for absences longer than 5 days'],
      ['Leave on demand', '4 days per year', 'same day, by 9:00'],
      ['Unpaid leave over 30 days', 'by agreement', 'written approval of the HR director'],
      ['Volunteering day', '1 day per year', '7 days'],
    ],
    leaveNote:
      'Unused annual leave carries over to the next year and must be taken by 30 September.',
    benefits: 'Benefits',
    benefitHeaders: ['Benefit', 'What the company covers', 'Employee contribution'],
    benefitRows: (referral) => [
      ['Private healthcare (Medicover)', 'full cost for the employee', 'PLN 95 per month for a family package'],
      ['Multisport card', 'PLN 120 per month', 'PLN 60 per month'],
      ['Life insurance', 'full cost', 'none'],
      ['Training budget', 'PLN 4,000 per employee per year', 'none'],
      ['Learning days', '4 paid days per year', 'none'],
      ['Referral bonus', `${referral} after 3 months of the referred hire`, 'none'],
    ],
    benefitNote:
      "The training budget covers courses, certifications and conference tickets related to the " +
      'role. Requests above PLN 2,000 need the director’s approval.',
    expenses: 'Expenses and business travel',
    expensesBody:
      'Expense claims are filed in Expensify within 30 days of the end of the trip; claims filed ' +
      'later are not processed. A VAT invoice issued to Acme Industries sp. z o.o. is required — ' +
      'a receipt alone is not sufficient.',
    expenseHeaders: ['Item', 'Limit'],
    expenseRows: [
      ['Accommodation in Poland', 'PLN 450 per night'],
      ['Accommodation abroad', 'EUR 140 per night'],
      ['Domestic per diem', 'PLN 45 per day'],
      ['Private car mileage', 'PLN 1.15 per kilometre'],
    ],
    expensesNote: 'Reimbursement is paid within 14 days of the manager approving the claim.',
    onboarding: 'Onboarding',
    onboardingBody:
      'New joiners receive a laptop, an access badge and a company email account on day one; IT ' +
      'creates the account no later than the day before the start date. Health and safety ' +
      'training takes 4 hours and GDPR training 2 hours, both in the first week. Every new ' +
      'joiner is assigned a buddy for the first 3 months, meeting at least weekly. The probation ' +
      'period is 3 months and the summary conversation takes place in week 11.',
    conduct: 'Code of conduct and whistleblowing',
    conductBody:
      'Acme Industries does not tolerate harassment, discrimination or any form of bribery. ' +
      'Gifts from contractors above PLN 200 in value must be reported to the compliance officer ' +
      'and are recorded in the gift register.',
    conductWhistle:
      'Concerns can be reported anonymously through the whistleblowing channel at ' +
      'sygnalista.acme-industries.pl. Reports are acknowledged within 7 days and resolved within ' +
      '3 months. Retaliation against a person who reports in good faith is a serious breach of ' +
      'employee duties.',
    security: 'Information security',
    securityList: [
      'company data is stored in company systems only — no private cloud drives,',
      'laptops are encrypted and screens lock after 5 minutes of inactivity,',
      'passwords are kept in the company password manager and never shared,',
      'a lost device is reported to IT within 24 hours,',
      'customer data leaves the company only under a signed data processing agreement.',
    ],
    footer: `${COMPANY.name} · Employee Handbook 2026 · demonstration document`,
  },
};

export function build(kit, doc, locale) {
  const s = COPY[locale];

  kit.title(doc, s.title, `${COMPANY.name}, ${COMPANY.street}, ${COMPANY.city} · ${s.subtitle}`);
  kit.para(doc, s.intro);

  kit.heading(doc, `1. ${s.time}`, 1);
  kit.para(doc, s.timeBody);

  kit.heading(doc, `2. ${s.remote}`, 1);
  kit.para(doc, s.remoteBody);
  kit.para(doc, s.remoteAllowance);

  kit.heading(doc, `3. ${s.leave}`, 1);
  kit.table(doc, s.leaveHeaders, s.leaveRows, [6, 4.5, 5.5]);
  kit.para(doc, s.leaveNote);

  kit.heading(doc, `4. ${s.benefits}`, 1);
  kit.table(doc, s.benefitHeaders, s.benefitRows(pick(REFERRAL_BONUS, locale)), [5, 6.5, 4.5]);
  kit.para(doc, s.benefitNote);

  kit.heading(doc, `5. ${s.expenses}`, 1);
  kit.para(doc, s.expensesBody);
  kit.table(doc, s.expenseHeaders, s.expenseRows, [8, 7]);
  kit.para(doc, s.expensesNote);

  kit.heading(doc, `6. ${s.onboarding}`, 1);
  kit.para(doc, s.onboardingBody);

  kit.heading(doc, `7. ${s.conduct}`, 1);
  kit.para(doc, s.conductBody);
  kit.para(doc, s.conductWhistle);

  kit.heading(doc, `8. ${s.security}`, 1);
  kit.bullets(doc, s.securityList);

  kit.footerNote(doc, s.footer);
}
