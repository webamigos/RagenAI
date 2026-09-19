/**
 * The facts the demo corpus is built from.
 *
 * One module, because the point of this corpus is that the documents agree
 * with each other: the SKU in the catalogue is the SKU in the price list is the
 * SKU in the stock report, the budget in the board minutes is the total of the
 * budget spreadsheet, and the SLA fee quoted in the sales FAQ is the one in the
 * service agreement. A demo where two documents contradict each other is worse
 * than no demo — the prospect's first cross-document question exposes it.
 *
 * Everything here is fictional. See README.md for the rules that keep it safe
 * to show a stranger.
 */

export const COMPANY = {
  name: 'Acme Industries sp. z o.o.',
  short: 'Acme Industries',
  street: 'ul. Kwiatowa 7',
  city: '61-001 Poznań',
  nip: '7792451234',
  regon: '302145678',
  krs: '0000412356',
  email: 'kontakt@acme-industries.pl',
  phone: '+48 61 245 18 00',
  web: 'www.acme-industries.pl',
  servicePortal: 'serwis.acme-industries.pl',
};

/**
 * Attendance is spelled out rather than derived: a Polish surname does not tell
 * you which form to use, and a demo document that misgenders its own board is a
 * bad look in front of a prospect.
 */
export const BOARD = [
  ['Marta Zielińska', 'Prezes Zarządu', 'obecna'],
  ['Tomasz Wrona', 'Wiceprezes Zarządu ds. operacyjnych', 'obecny'],
  ['Katarzyna Lis', 'Dyrektor handlowy', 'obecna'],
  ['Robert Nowak', 'Dyrektor personalny', 'obecny'],
  ['Anna Dąbrowska', 'Dyrektor finansowy', 'obecna'],
];

export const WAREHOUSES = [
  ['M1', 'Poznań', 'ul. Kwiatowa 7', 'czynny'],
  ['M2', 'Wrocław', 'ul. Graniczna 112', 'czynny'],
  ['M3', 'Gdańsk', 'ul. Portowa 4', 'uruchomienie 1 czerwca 2026'],
];

/**
 * The warranty column is not free: § 6 of the framework agreement grants 24
 * months on racking and 12 on everything else, and the corpus test holds this
 * table to it.
 */
export const PRODUCTS = [
  { sku: 'RGM-200', name: 'Regał paletowy Magnus 200', unit: 'szt.', price: 1480.0, warranty: 24, lead: 14, line: 'Regały' },
  { sku: 'RGM-350', name: 'Regał paletowy Magnus 350', unit: 'szt.', price: 2240.0, warranty: 24, lead: 21, line: 'Regały' },
  { sku: 'RGP-120', name: 'Regał półkowy Pico 120', unit: 'szt.', price: 640.0, warranty: 24, lead: 7, line: 'Regały' },
  { sku: 'RGW-080', name: 'Regał wspornikowy Wektor 80', unit: 'szt.', price: 3150.0, warranty: 24, lead: 28, line: 'Regały' },
  { sku: 'WZR-15', name: 'Wózek paletowy ręczny Rolo 1,5 t', unit: 'szt.', price: 890.0, warranty: 12, lead: 7, line: 'Wózki' },
  { sku: 'WZU-13', name: 'Wózek unoszący Rolo-U 1,3 t', unit: 'szt.', price: 5700.0, warranty: 12, lead: 21, line: 'Wózki' },
  { sku: 'WZE-20', name: 'Wózek paletowy elektryczny Rolo-E 2,0 t', unit: 'szt.', price: 12400.0, warranty: 12, lead: 35, line: 'Wózki' },
  { sku: 'AKB-050', name: 'Belka nośna 50 (para)', unit: 'kpl.', price: 118.0, warranty: 12, lead: 3, line: 'Akcesoria' },
  { sku: 'AKO-100', name: 'Osłona słupa 100', unit: 'szt.', price: 74.0, warranty: 12, lead: 3, line: 'Akcesoria' },
  { sku: 'AKS-025', name: 'Siatka zabezpieczająca 2,5 m', unit: 'szt.', price: 310.0, warranty: 12, lead: 5, line: 'Akcesoria' },
  { sku: 'AKK-001', name: 'Kotwa montażowa M12 (kpl. 10)', unit: 'kpl.', price: 96.0, warranty: 12, lead: 3, line: 'Akcesoria' },
];

export const PRODUCT_LINES = ['Regały', 'Wózki', 'Akcesoria'];

/** Quoted in the catalogue, and answerable on their own. */
export const PRODUCT_SPECS = {
  'RGM-200': [
    ['Nośność półki', '2 000 kg'],
    ['Wysokość konstrukcji', '4,5 m'],
    ['Głębokość', '1 100 mm'],
    ['Powłoka', 'proszkowa RAL 5010'],
    ['Norma', 'PN-EN 15512'],
  ],
  'RGM-350': [
    ['Nośność półki', '3 500 kg'],
    ['Wysokość konstrukcji', '6,0 m'],
    ['Głębokość', '1 100 mm'],
    ['Powłoka', 'proszkowa RAL 5010'],
    ['Norma', 'PN-EN 15512'],
  ],
  'RGP-120': [
    ['Nośność półki', '120 kg'],
    ['Wysokość konstrukcji', '2,0 m'],
    ['Głębokość', '600 mm'],
    ['Powłoka', 'ocynk galwaniczny'],
    ['Norma', 'PN-EN 15620'],
  ],
  'RGW-080': [
    ['Nośność ramienia', '800 kg'],
    ['Wysokość konstrukcji', '5,0 m'],
    ['Długość ramienia', '1 200 mm'],
    ['Powłoka', 'proszkowa RAL 7016'],
    ['Norma', 'PN-EN 15512'],
  ],
  'WZR-15': [
    ['Udźwig', '1 500 kg'],
    ['Długość wideł', '1 150 mm'],
    ['Wysokość podnoszenia', '200 mm'],
    ['Masa własna', '72 kg'],
  ],
  'WZU-13': [
    ['Udźwig', '1 300 kg'],
    ['Wysokość podnoszenia', '800 mm'],
    ['Zasilanie', 'akumulator 24 V / 85 Ah'],
    ['Masa własna', '310 kg'],
  ],
  'WZE-20': [
    ['Udźwig', '2 000 kg'],
    ['Prędkość jazdy z ładunkiem', '5,5 km/h'],
    ['Zasilanie', 'litowo-jonowe 24 V / 210 Ah'],
    ['Czas ładowania', '2,5 h'],
    ['Masa własna', '640 kg'],
  ],
};

/** Quoted in the price list, the framework agreement and the sales FAQ. */
export const DISCOUNTS = [
  ['1–9 szt.', '0%'],
  ['10–24 szt.', '5%'],
  ['25–49 szt.', '8%'],
  ['50–99 szt.', '12%'],
  ['100 szt. i więcej', '15%'],
];

export const VAT_RATE = '23%';
export const PAYMENT_DAYS = 30;

export const SLA_LEVELS = [
  {
    priority: 'P1 — krytyczny',
    definition: 'przestój magazynu, wyłączenie regału z eksploatacji lub zagrożenie bezpieczeństwa',
    response: '4 godziny',
    fix: '24 godziny',
    window: '24/7',
  },
  {
    priority: 'P2 — poważny',
    definition: 'ograniczona funkcjonalność sprzętu bez ryzyka dla bezpieczeństwa',
    response: '8 godzin roboczych',
    fix: '3 dni robocze',
    window: 'pn–pt 7:00–19:00',
  },
  {
    priority: 'P3 — drobny',
    definition: 'usterka kosmetyczna, zużycie eksploatacyjne, zapytanie techniczne',
    response: '2 dni robocze',
    fix: '10 dni roboczych',
    window: 'pn–pt 7:00–19:00',
  },
];

export const SLA_FEE_PERCENT = '3,2%';
export const SLA_FEE_MINIMUM = '8 400 zł netto rocznie';
export const SLA_PENALTY_PER_HOUR = '200 zł';
export const SLA_PENALTY_CAP = '10% rocznej opłaty serwisowej';
export const SLA_AVAILABILITY_TARGET = '99,0%';
export const SLA_INSPECTION_INTERVAL = '12 miesięcy';

/** 2025 annual report. The sales spreadsheet has to add up to these. */
export const REVENUE_2025 = {
  Regały: 27_300_000,
  Wózki: 15_100_000,
  Akcesoria: 3_800_000,
  Serwis: 2_400_000,
};

export const REVENUE_2024_TOTAL = 42_100_000;
export const EBITDA_2025 = 6_900_000;
export const EBITDA_2024 = 5_100_000;
export const HEADCOUNT_2025 = 214;
export const HEADCOUNT_2024 = 187;
export const EXPORT_SHARE = '22%';
export const EXPORT_MARKETS = ['Niemcy', 'Czechy', 'Litwa'];
export const LARGEST_CUSTOMER_SHARE = '9,4%';
export const CAPEX_2025 = '3,1 mln zł (linia lakiernicza w zakładzie w Poznaniu)';
export const REVENUE_TARGET_2026 = '55 mln zł';

export const REGIONS = ['Północ', 'Południe', 'Zachód', 'Wschód', 'Eksport'];

/** Board resolution 1/2026 — the total the marketing budget must hit. */
export const MARKETING_BUDGET_2026 = 1_240_000;

export const MARKETING_CHANNELS = [
  ['Targi branżowe', 0.31],
  ['Reklama online (SEM/SEO)', 0.22],
  ['Materiały drukowane i katalogi', 0.11],
  ['Konferencje i szkolenia dla klientów', 0.14],
  ['Content marketing i PR', 0.12],
  ['Upominki i materiały POS', 0.1],
];

export const PRICE_INCREASE_2026 = '4,5% od 1 kwietnia 2026';
export const REFERRAL_BONUS = '3 000 zł';

export const TOP_CUSTOMERS_2025 = [
  ['Logistyka Wielkopolska S.A.', 'Północ', 4_568_000],
  ['Chłodnie Bałtyckie sp. z o.o.', 'Północ', 3_120_000],
  ['MetalTrans sp. j.', 'Zachód', 2_845_000],
  ['Grupa Spedycyjna Karpaty', 'Południe', 2_410_000],
  ['Hansa Lager GmbH', 'Eksport', 2_260_000],
  ['Dystrybucja Wschód sp. z o.o.', 'Wschód', 1_980_000],
  ['Meblarnia Kaszuby S.A.', 'Północ', 1_640_000],
  ['Przemysł Chemiczny Odra S.A.', 'Zachód', 1_510_000],
];

/**
 * Marketing spend a year earlier, so the 2026 budget can be compared with
 * something. Plan 980 000 zł, spent 965 100 zł — 98,5% of plan.
 */
export const EXECUTION_2025 = [
  ['Targi branżowe', 320_000, 341_200],
  ['Reklama online (SEM/SEO)', 210_000, 198_400],
  ['Materiały drukowane i katalogi', 110_000, 104_600],
  ['Konferencje i szkolenia dla klientów', 140_000, 131_900],
  ['Content marketing i PR', 120_000, 112_700],
  ['Upominki i materiały POS', 80_000, 76_300],
];

/**
 * Open purchase orders. WZE-20 and AKS-025 are the two SKUs sitting below
 * their minimum stock level, so a question about either has an answer in two
 * documents: what is missing, and when it arrives.
 */
export const INBOUND_ORDERS = [
  ['ZAM/2026/041', 'WZE-20', 'Wózek paletowy elektryczny Rolo-E 2,0 t', 14, 'M1 Poznań', 'Elektro Handling GmbH', '10 kwietnia 2026', 'potwierdzone'],
  ['ZAM/2026/043', 'AKS-025', 'Siatka zabezpieczająca 2,5 m', 400, 'M1 Poznań', 'Drutex Siatki sp. z o.o.', '18 marca 2026', 'potwierdzone'],
  ['ZAM/2026/044', 'RGM-200', 'Regał paletowy Magnus 200', 260, 'M3 Gdańsk', 'produkcja własna', '25 maja 2026', 'w produkcji'],
  ['ZAM/2026/045', 'RGP-120', 'Regał półkowy Pico 120', 500, 'M3 Gdańsk', 'produkcja własna', '25 maja 2026', 'w produkcji'],
  ['ZAM/2026/047', 'WZR-15', 'Wózek paletowy ręczny Rolo 1,5 t', 80, 'M2 Wrocław', 'Hydro Lift s.r.o.', '2 kwietnia 2026', 'potwierdzone'],
  ['ZAM/2026/048', 'AKK-001', 'Kotwa montażowa M12 (kpl. 10)', 1200, 'M1 Poznań', 'Stalmet sp. j.', '12 marca 2026', 'oczekuje na potwierdzenie'],
];
