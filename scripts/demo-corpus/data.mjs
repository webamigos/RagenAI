/**
 * The facts the demo corpus is built from, in both languages.
 *
 * One module, because the point of this corpus is that the documents agree
 * with each other: the SKU in the catalogue is the SKU in the price list is the
 * SKU in the stock report, the budget in the board minutes is the total of the
 * budget spreadsheet, and the SLA fee quoted in the sales FAQ is the one in the
 * service agreement. A demo where two documents contradict each other is worse
 * than no demo — the prospect's first cross-document question exposes it.
 *
 * Every label carries both languages side by side (`t('Regały', 'Racking')`)
 * rather than living in two files. A translation that drifts is the same
 * failure as a contradiction, and the only reliable defence is that the two
 * strings are on the same line when someone edits one of them.
 *
 * **Numbers appear once.** The Polish and English documents quote the same
 * figures, formatted per locale — PLN 1,480.00 against 1 480,00 zł — so the
 * two corpora can share one knowledge base without answering the same question
 * two ways. `tests/architecture/demo-corpus-agrees-with-itself.test.ts` checks
 * this by comparing digits, which is also how the RAG benchmark's grader
 * compares figures across locales.
 *
 * Everything here is fictional. See README.md for the rules that keep it safe
 * to show a stranger.
 */

/** A label in both languages. */
export const t = (pl, en) => ({ pl, en });

export const LOCALES = ['pl', 'en'];

export const COMPANY = {
  name: 'Acme Industries sp. z o.o.',
  street: 'ul. Kwiatowa 7',
  city: '61-001 Poznań',
  country: t('Polska', 'Poland'),
  nip: '7792451234',
  regon: '302145678',
  krs: '0000412356',
  email: 'kontakt@acme-industries.pl',
  phone: '+48 61 245 18 00',
  web: 'www.acme-industries.pl',
  servicePortal: 'serwis.acme-industries.pl',
  orders: 'zamowienia@acme-industries.pl',
  complaints: 'reklamacje@acme-industries.pl',
};

/**
 * Attendance is spelled out rather than derived: a Polish surname does not tell
 * you which form to use, and a demo document that misgenders its own board is a
 * bad look in front of a prospect.
 */
export const BOARD = [
  { name: 'Marta Zielińska', role: t('Prezes Zarządu', 'Chief Executive Officer'), present: t('obecna', 'present') },
  { name: 'Tomasz Wrona', role: t('Wiceprezes Zarządu ds. operacyjnych', 'Chief Operating Officer'), present: t('obecny', 'present') },
  { name: 'Katarzyna Lis', role: t('Dyrektor handlowy', 'Sales Director'), present: t('obecna', 'present') },
  { name: 'Robert Nowak', role: t('Dyrektor personalny', 'HR Director'), present: t('obecny', 'present') },
  { name: 'Anna Dąbrowska', role: t('Dyrektor finansowy', 'Chief Financial Officer'), present: t('obecna', 'present') },
];

export const WAREHOUSES = [
  { code: 'M1', city: 'Poznań', address: 'ul. Kwiatowa 7', status: t('czynny', 'operating') },
  { code: 'M2', city: 'Wrocław', address: 'ul. Graniczna 112', status: t('czynny', 'operating') },
  { code: 'M3', city: 'Gdańsk', address: 'ul. Portowa 4', status: t('uruchomienie 1 czerwca 2026', 'opens 1 June 2026') },
];

export const LINES = {
  racking: t('Regały', 'Racking'),
  trucks: t('Wózki', 'Pallet trucks'),
  accessories: t('Akcesoria', 'Accessories'),
  service: t('Serwis', 'Service'),
};

const PIECE = t('szt.', 'pcs');
const SET = t('kpl.', 'set');

/**
 * The warranty column is not free: § 6 of the framework agreement grants 24
 * months on racking and 12 on everything else, and the corpus test holds this
 * table to it.
 */
export const PRODUCTS = [
  { sku: 'RGM-200', line: 'racking', unit: PIECE, price: 1480.0, warranty: 24, lead: 14, name: t('Regał paletowy Magnus 200', 'Magnus 200 pallet racking') },
  { sku: 'RGM-350', line: 'racking', unit: PIECE, price: 2240.0, warranty: 24, lead: 21, name: t('Regał paletowy Magnus 350', 'Magnus 350 pallet racking') },
  { sku: 'RGP-120', line: 'racking', unit: PIECE, price: 640.0, warranty: 24, lead: 7, name: t('Regał półkowy Pico 120', 'Pico 120 shelving unit') },
  { sku: 'RGW-080', line: 'racking', unit: PIECE, price: 3150.0, warranty: 24, lead: 28, name: t('Regał wspornikowy Wektor 80', 'Wektor 80 cantilever racking') },
  { sku: 'WZR-15', line: 'trucks', unit: PIECE, price: 890.0, warranty: 12, lead: 7, name: t('Wózek paletowy ręczny Rolo 1,5 t', 'Rolo 1.5 t hand pallet truck') },
  { sku: 'WZU-13', line: 'trucks', unit: PIECE, price: 5700.0, warranty: 12, lead: 21, name: t('Wózek unoszący Rolo-U 1,3 t', 'Rolo-U 1.3 t stacker') },
  { sku: 'WZE-20', line: 'trucks', unit: PIECE, price: 12400.0, warranty: 12, lead: 35, name: t('Wózek paletowy elektryczny Rolo-E 2,0 t', 'Rolo-E 2.0 t electric pallet truck') },
  { sku: 'AKB-050', line: 'accessories', unit: SET, price: 118.0, warranty: 12, lead: 3, name: t('Belka nośna 50 (para)', 'Load beam 50 (pair)') },
  { sku: 'AKO-100', line: 'accessories', unit: PIECE, price: 74.0, warranty: 12, lead: 3, name: t('Osłona słupa 100', 'Upright protector 100') },
  { sku: 'AKS-025', line: 'accessories', unit: PIECE, price: 310.0, warranty: 12, lead: 5, name: t('Siatka zabezpieczająca 2,5 m', 'Safety mesh 2.5 m') },
  { sku: 'AKK-001', line: 'accessories', unit: SET, price: 96.0, warranty: 12, lead: 3, name: t('Kotwa montażowa M12 (kpl. 10)', 'M12 anchor bolt (set of 10)') },
];

export const PRODUCT_LINES = ['racking', 'trucks', 'accessories'];

/**
 * Quoted in the catalogue, and answerable on their own. Units are written the
 * same way in both languages; the decimal comma is swapped for a point, which
 * leaves the digits identical.
 */
export const PRODUCT_SPECS = {
  'RGM-200': [
    [t('Nośność półki', 'Shelf load capacity'), t('2 000 kg', '2,000 kg')],
    [t('Wysokość konstrukcji', 'Frame height'), t('4,5 m', '4.5 m')],
    [t('Głębokość', 'Depth'), t('1 100 mm', '1,100 mm')],
    [t('Powłoka', 'Finish'), t('proszkowa RAL 5010', 'powder coating RAL 5010')],
    [t('Norma', 'Standard'), t('PN-EN 15512', 'PN-EN 15512')],
  ],
  'RGM-350': [
    [t('Nośność półki', 'Shelf load capacity'), t('3 500 kg', '3,500 kg')],
    [t('Wysokość konstrukcji', 'Frame height'), t('6,0 m', '6.0 m')],
    [t('Głębokość', 'Depth'), t('1 100 mm', '1,100 mm')],
    [t('Powłoka', 'Finish'), t('proszkowa RAL 5010', 'powder coating RAL 5010')],
    [t('Norma', 'Standard'), t('PN-EN 15512', 'PN-EN 15512')],
  ],
  'RGP-120': [
    [t('Nośność półki', 'Shelf load capacity'), t('120 kg', '120 kg')],
    [t('Wysokość konstrukcji', 'Frame height'), t('2,0 m', '2.0 m')],
    [t('Głębokość', 'Depth'), t('600 mm', '600 mm')],
    [t('Powłoka', 'Finish'), t('ocynk galwaniczny', 'electrogalvanised')],
    [t('Norma', 'Standard'), t('PN-EN 15620', 'PN-EN 15620')],
  ],
  'RGW-080': [
    [t('Nośność ramienia', 'Arm load capacity'), t('800 kg', '800 kg')],
    [t('Wysokość konstrukcji', 'Frame height'), t('5,0 m', '5.0 m')],
    [t('Długość ramienia', 'Arm length'), t('1 200 mm', '1,200 mm')],
    [t('Powłoka', 'Finish'), t('proszkowa RAL 7016', 'powder coating RAL 7016')],
    [t('Norma', 'Standard'), t('PN-EN 15512', 'PN-EN 15512')],
  ],
  'WZR-15': [
    [t('Udźwig', 'Load capacity'), t('1 500 kg', '1,500 kg')],
    [t('Długość wideł', 'Fork length'), t('1 150 mm', '1,150 mm')],
    [t('Wysokość podnoszenia', 'Lift height'), t('200 mm', '200 mm')],
    [t('Masa własna', 'Net weight'), t('72 kg', '72 kg')],
  ],
  'WZU-13': [
    [t('Udźwig', 'Load capacity'), t('1 300 kg', '1,300 kg')],
    [t('Wysokość podnoszenia', 'Lift height'), t('800 mm', '800 mm')],
    [t('Zasilanie', 'Power supply'), t('akumulator 24 V / 85 Ah', 'battery 24 V / 85 Ah')],
    [t('Masa własna', 'Net weight'), t('310 kg', '310 kg')],
  ],
  'WZE-20': [
    [t('Udźwig', 'Load capacity'), t('2 000 kg', '2,000 kg')],
    [t('Prędkość jazdy z ładunkiem', 'Travel speed, laden'), t('5,5 km/h', '5.5 km/h')],
    [t('Zasilanie', 'Power supply'), t('litowo-jonowe 24 V / 210 Ah', 'lithium-ion 24 V / 210 Ah')],
    [t('Czas ładowania', 'Charging time'), t('2,5 h', '2.5 h')],
    [t('Masa własna', 'Net weight'), t('640 kg', '640 kg')],
  ],
};

/** Quoted in the price list, the framework agreement and the sales FAQ. */
export const DISCOUNTS = [
  { band: t('1–9 szt.', '1–9 pcs'), discount: '0%' },
  { band: t('10–24 szt.', '10–24 pcs'), discount: '5%' },
  { band: t('25–49 szt.', '25–49 pcs'), discount: '8%' },
  { band: t('50–99 szt.', '50–99 pcs'), discount: '12%' },
  { band: t('100 szt. i więcej', '100 pcs and above'), discount: '15%' },
];

export const VAT_RATE = '23%';
export const PAYMENT_DAYS = 30;

export const SLA_LEVELS = [
  {
    priority: t('P1 — krytyczny', 'P1 — critical'),
    definition: t(
      'przestój magazynu, wyłączenie regału z eksploatacji lub zagrożenie bezpieczeństwa',
      'warehouse standstill, racking taken out of service, or a safety hazard',
    ),
    response: t('4 godziny', '4 hours'),
    fix: t('24 godziny', '24 hours'),
    window: t('24/7', '24/7'),
  },
  {
    priority: t('P2 — poważny', 'P2 — major'),
    definition: t(
      'ograniczona funkcjonalność sprzętu bez ryzyka dla bezpieczeństwa',
      'reduced equipment function with no safety risk',
    ),
    response: t('8 godzin roboczych', '8 working hours'),
    fix: t('3 dni robocze', '3 working days'),
    window: t('pn–pt 7:00–19:00', 'Mon–Fri 7:00–19:00'),
  },
  {
    priority: t('P3 — drobny', 'P3 — minor'),
    definition: t(
      'usterka kosmetyczna, zużycie eksploatacyjne, zapytanie techniczne',
      'cosmetic fault, normal wear, or a technical question',
    ),
    response: t('2 dni robocze', '2 working days'),
    fix: t('10 dni roboczych', '10 working days'),
    window: t('pn–pt 7:00–19:00', 'Mon–Fri 7:00–19:00'),
  },
];

export const SLA_FEE_PERCENT = t('3,2%', '3.2%');
export const SLA_FEE_MINIMUM = t('8 400 zł netto rocznie', 'PLN 8,400 net per year');
export const SLA_PENALTY_PER_HOUR = t('200 zł', 'PLN 200');
export const SLA_PENALTY_CAP = t('10% rocznej opłaty serwisowej', '10% of the annual service fee');
export const SLA_AVAILABILITY_TARGET = t('99,0%', '99.0%');
export const SLA_INSPECTION_INTERVAL = t('12 miesięcy', '12 months');

/** 2025 annual report. The sales spreadsheet has to add up to these. */
export const REVENUE_2025 = {
  racking: 27_300_000,
  trucks: 15_100_000,
  accessories: 3_800_000,
  service: 2_400_000,
};

export const REVENUE_2024_TOTAL = 42_100_000;
export const EBITDA_2025 = 6_900_000;
export const EBITDA_2024 = 5_100_000;
export const HEADCOUNT_2025 = 214;
export const HEADCOUNT_2024 = 187;
export const EXPORT_SHARE = '22%';
export const EXPORT_SHARE_2024 = '17%';
export const LARGEST_CUSTOMER_SHARE = t('9,4%', '9.4%');
export const REVENUE_TARGET_2026 = t('55 mln zł', 'PLN 55 million');
export const CAPEX_2025 = t(
  '3,1 mln zł (linia lakiernicza w zakładzie w Poznaniu)',
  'PLN 3.1 million (a paint line at the Poznań plant)',
);
export const EXPORT_MARKETS = t('Niemcy, Czechy i Litwa', 'Germany, the Czech Republic and Lithuania');

export const REGIONS = {
  north: t('Północ', 'North'),
  south: t('Południe', 'South'),
  west: t('Zachód', 'West'),
  east: t('Wschód', 'East'),
  export: t('Eksport', 'Export'),
};

export const REGION_KEYS = ['north', 'south', 'west', 'east', 'export'];

/** Board resolution 1/2026 — the total the marketing budget must hit. */
export const MARKETING_BUDGET_2026 = 1_240_000;

export const MARKETING_CHANNELS = [
  { key: 'fairs', share: 0.31, label: t('Targi branżowe', 'Trade fairs') },
  { key: 'online', share: 0.22, label: t('Reklama online (SEM/SEO)', 'Online advertising (SEM/SEO)') },
  { key: 'print', share: 0.11, label: t('Materiały drukowane i katalogi', 'Print materials and catalogues') },
  { key: 'events', share: 0.14, label: t('Konferencje i szkolenia dla klientów', 'Customer conferences and training') },
  { key: 'content', share: 0.12, label: t('Content marketing i PR', 'Content marketing and PR') },
  { key: 'pos', share: 0.1, label: t('Upominki i materiały POS', 'Gifts and point-of-sale materials') },
];

export const PRICE_INCREASE_2026 = t('4,5% od 1 kwietnia 2026', '4.5% from 1 April 2026');
export const REFERRAL_BONUS = t('3 000 zł', 'PLN 3,000');

export const TOP_CUSTOMERS_2025 = [
  { name: 'Logistyka Wielkopolska S.A.', region: 'north', revenue: 4_568_000 },
  { name: 'Chłodnie Bałtyckie sp. z o.o.', region: 'north', revenue: 3_120_000 },
  { name: 'MetalTrans sp. j.', region: 'west', revenue: 2_845_000 },
  { name: 'Grupa Spedycyjna Karpaty', region: 'south', revenue: 2_410_000 },
  { name: 'Hansa Lager GmbH', region: 'export', revenue: 2_260_000 },
  { name: 'Dystrybucja Wschód sp. z o.o.', region: 'east', revenue: 1_980_000 },
  { name: 'Meblarnia Kaszuby S.A.', region: 'north', revenue: 1_640_000 },
  { name: 'Przemysł Chemiczny Odra S.A.', region: 'west', revenue: 1_510_000 },
];

/**
 * Marketing spend a year earlier, so the 2026 budget can be compared with
 * something. Plan 980 000 zł, spent 965 100 zł — 98.5% of plan.
 */
export const EXECUTION_2025 = [
  { key: 'fairs', plan: 320_000, spent: 341_200 },
  { key: 'online', plan: 210_000, spent: 198_400 },
  { key: 'print', plan: 110_000, spent: 104_600 },
  { key: 'events', plan: 140_000, spent: 131_900 },
  { key: 'content', plan: 120_000, spent: 112_700 },
  { key: 'pos', plan: 80_000, spent: 76_300 },
];

/**
 * Open purchase orders. WZE-20 and AKS-025 are the two SKUs sitting below
 * their minimum stock level, so a question about either has an answer in two
 * documents: what is missing, and when it arrives.
 */
export const INBOUND_ORDERS = [
  { order: 'ZAM/2026/041', sku: 'WZE-20', quantity: 14, warehouse: 'M1', supplier: 'Elektro Handling GmbH', eta: t('10 kwietnia 2026', '10 April 2026'), status: t('potwierdzone', 'confirmed') },
  { order: 'ZAM/2026/043', sku: 'AKS-025', quantity: 400, warehouse: 'M1', supplier: 'Drutex Siatki sp. z o.o.', eta: t('18 marca 2026', '18 March 2026'), status: t('potwierdzone', 'confirmed') },
  { order: 'ZAM/2026/044', sku: 'RGM-200', quantity: 260, warehouse: 'M3', supplier: t('produkcja własna', 'in-house production'), eta: t('25 maja 2026', '25 May 2026'), status: t('w produkcji', 'in production') },
  { order: 'ZAM/2026/045', sku: 'RGP-120', quantity: 500, warehouse: 'M3', supplier: t('produkcja własna', 'in-house production'), eta: t('25 maja 2026', '25 May 2026'), status: t('w produkcji', 'in production') },
  { order: 'ZAM/2026/047', sku: 'WZR-15', quantity: 80, warehouse: 'M2', supplier: 'Hydro Lift s.r.o.', eta: t('2 kwietnia 2026', '2 April 2026'), status: t('potwierdzone', 'confirmed') },
  { order: 'ZAM/2026/048', sku: 'AKK-001', quantity: 1200, warehouse: 'M1', supplier: 'Stalmet sp. j.', eta: t('12 marca 2026', '12 March 2026'), status: t('oczekuje na potwierdzenie', 'awaiting confirmation') },
];

export const PRODUCT_BY_SKU = Object.fromEntries(PRODUCTS.map((p) => [p.sku, p]));
