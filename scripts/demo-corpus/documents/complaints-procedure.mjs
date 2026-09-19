/** The complaints procedure: deadlines, stages, what is not covered. */

import { COMPANY, SLA_INSPECTION_INTERVAL } from '../data.mjs';
import { pick } from '../format.mjs';

export const format = 'docx';

export const file = {
  pl: 'procedura-reklamacyjna.docx',
  en: 'complaints-procedure.docx',
};

const COPY = {
  pl: {
    title: 'Procedura reklamacyjna P-07',
    subtitle: 'wersja 3.1, obowiązuje od 1 lutego 2026',
    purpose: '1. Cel i zakres',
    purposeBody:
      'Procedura określa sposób przyjmowania, rozpatrywania i zamykania reklamacji dotyczących ' +
      'wyposażenia magazynowego sprzedanego przez Acme Industries. Obowiązuje dział serwisu, ' +
      'dział handlowy i magazyn.',
    filing: '2. Zgłoszenie reklamacji',
    filingBody: (portal, email) =>
      `Reklamacje przyjmowane są przez portal ${portal} oraz pocztą elektroniczną na adres ` +
      `${email}. Zgłoszenie musi zawierać numer faktury, SKU produktu, opis wady i zdjęcia.`,
    filingHeaders: ['Rodzaj wady', 'Termin zgłoszenia', 'Podstawa'],
    filingRows: [
      ['Wada jawna (widoczna przy odbiorze)', '7 dni od daty dostawy', 'protokół odbioru'],
      ['Braki ilościowe', '3 dni robocze od daty dostawy', 'protokół odbioru'],
      ['Wada ukryta', '14 dni od wykrycia, w okresie gwarancji', 'karta gwarancyjna'],
      ['Uszkodzenie w transporcie', '24 godziny od dostawy', 'protokół szkody przewoźnika'],
    ],
    deadlines: '3. Terminy rozpatrzenia',
    deadlineHeaders: ['Etap', 'Termin', 'Odpowiedzialny'],
    deadlineRows: [
      ['Potwierdzenie przyjęcia zgłoszenia', '1 dzień roboczy', 'specjalista ds. serwisu'],
      ['Oględziny u klienta (jeśli wymagane)', '5 dni roboczych od przyjęcia', 'technik serwisu'],
      ['Decyzja o uznaniu lub odrzuceniu', '14 dni kalendarzowych od zgłoszenia', 'kierownik serwisu'],
      ['Naprawa lub wymiana towaru', '21 dni od uznania reklamacji', 'dział serwisu'],
      ['Zwrot środków', '14 dni od uznania reklamacji', 'dział finansowy'],
      ['Odwołanie klienta od decyzji', '14 dni od doręczenia decyzji', 'dyrektor handlowy'],
    ],
    deadlineNote:
      'Brak decyzji w terminie 14 dni kalendarzowych oznacza uznanie reklamacji zgodnie ' +
      'z art. 5615 Kodeksu cywilnego.',
    excluded: '4. Reklamacje nieuznawane',
    excludedList: (interval) => [
      'uszkodzenia mechaniczne powstałe z winy użytkownika, w tym najechanie wózkiem na ramę regału,',
      'przeciążenie konstrukcji ponad nośność podaną w karcie produktu,',
      'montaż niezgodny z instrukcją lub przez ekipę nieautoryzowaną przez Dostawcę,',
      `brak udokumentowanego przeglądu okresowego wykonywanego co ${interval},`,
      'zużycie eksploatacyjne elementów wymiennych: rolek, akumulatorów, uszczelek,',
      'korozja powierzchniowa w obiektach o wilgotności powyżej 80% bez zamówionej powłoki antykorozyjnej.',
    ],
    escalation: '5. Klasyfikacja i eskalacja',
    escalationBody:
      'Reklamacja dotycząca bezpieczeństwa konstrukcji jest zawsze traktowana jako priorytet P1 ' +
      'zgodnie z umową serwisową i podlega natychmiastowej eskalacji do kierownika serwisu oraz ' +
      'wiceprezesa ds. operacyjnych. Do czasu oględzin regał zostaje wyłączony z eksploatacji.',
    register: '6. Rejestr i wskaźniki',
    registerBody:
      'Wszystkie zgłoszenia rejestrowane są w systemie serwisowym z numerem w formacie ' +
      'REK/RRRR/NNN. Dział serwisu raportuje kwartalnie trzy wskaźniki: liczbę reklamacji ' +
      'na 1 000 sprzedanych sztuk (cel: poniżej 4), udział reklamacji uznanych (cel: poniżej 60%) ' +
      'oraz średni czas zamknięcia (cel: poniżej 18 dni).',
    footer: `${COMPANY.name} · Procedura reklamacyjna P-07 · dokument demonstracyjny`,
  },
  en: {
    title: 'Complaints Procedure P-07',
    subtitle: 'version 3.1, in force from 1 February 2026',
    purpose: '1. Purpose and scope',
    purposeBody:
      'This procedure sets out how complaints about warehouse equipment sold by Acme Industries ' +
      'are received, assessed and closed. It applies to the service department, the sales ' +
      'department and the warehouse.',
    filing: '2. Filing a complaint',
    filingBody: (portal, email) =>
      `Complaints are accepted through the ${portal} portal and by email to ${email}. A complaint ` +
      'must state the invoice number, the product SKU, a description of the defect, and photographs.',
    filingHeaders: ['Type of defect', 'Filing deadline', 'Basis'],
    filingRows: [
      ['Apparent defect (visible on delivery)', '7 days from the delivery date', 'delivery note'],
      ['Shortfall in quantity', '3 working days from the delivery date', 'delivery note'],
      ['Latent defect', '14 days from discovery, within the warranty', 'warranty card'],
      ['Damage in transit', '24 hours from delivery', "carrier's damage report"],
    ],
    deadlines: '3. Assessment deadlines',
    deadlineHeaders: ['Stage', 'Deadline', 'Owner'],
    deadlineRows: [
      ['Acknowledgement of the complaint', '1 working day', 'service specialist'],
      ['On-site inspection (where required)', '5 working days from receipt', 'service engineer'],
      ['Decision to accept or reject', '14 calendar days from filing', 'service manager'],
      ['Repair or replacement', '21 days from acceptance', 'service department'],
      ['Refund', '14 days from acceptance', 'finance department'],
      ['Customer appeal against the decision', '14 days from service of the decision', 'Sales Director'],
    ],
    deadlineNote:
      'No decision within 14 calendar days means the complaint is accepted, under article 5615 ' +
      'of the Polish Civil Code.',
    excluded: '4. Complaints not accepted',
    excludedList: (interval) => [
      'mechanical damage caused by the user, including a forklift striking a racking frame,',
      'loading a structure beyond the capacity stated on its product card,',
      "installation contrary to the instructions or by a crew not authorised by the Supplier,",
      `no documented periodic inspection carried out every ${interval},`,
      'normal wear of replaceable parts: rollers, batteries and seals,',
      'surface corrosion at sites above 80% humidity without the anti-corrosion finish ordered.',
    ],
    escalation: '5. Classification and escalation',
    escalationBody:
      'A complaint concerning structural safety is always treated as priority P1 under the ' +
      'service agreement and is escalated immediately to the service manager and the Chief ' +
      'Operating Officer. The racking is taken out of service until it has been inspected.',
    register: '6. Register and measures',
    registerBody:
      'Every complaint is recorded in the service system with a reference in the form ' +
      'REK/YYYY/NNN. The service department reports three measures quarterly: complaints per ' +
      '1,000 units sold (target: below 4), the share of complaints accepted (target: below 60%), ' +
      'and the average time to close (target: below 18 days).',
    footer: `${COMPANY.name} · Complaints Procedure P-07 · demonstration document`,
  },
};

export function build(kit, doc, locale) {
  const s = COPY[locale];

  kit.title(
    doc,
    s.title,
    `${COMPANY.name}, ${COMPANY.street}, ${COMPANY.city} · NIP ${COMPANY.nip} · ${s.subtitle}`,
  );

  kit.heading(doc, s.purpose, 2);
  kit.para(doc, s.purposeBody);

  kit.heading(doc, s.filing, 2);
  kit.para(doc, s.filingBody(COMPANY.servicePortal, COMPANY.complaints));
  kit.table(doc, s.filingHeaders, s.filingRows, [6, 6, 4.5]);

  kit.heading(doc, s.deadlines, 2);
  kit.table(doc, s.deadlineHeaders, s.deadlineRows, [6.5, 5.5, 4.5]);
  kit.para(doc, s.deadlineNote);

  kit.heading(doc, s.excluded, 2);
  kit.bullets(doc, s.excludedList(pick(SLA_INSPECTION_INTERVAL, locale)));

  kit.heading(doc, s.escalation, 2);
  kit.para(doc, s.escalationBody);

  kit.heading(doc, s.register, 2);
  kit.para(doc, s.registerBody);

  kit.footerNote(doc, s.footer);
}
