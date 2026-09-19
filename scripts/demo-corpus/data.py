"""
The facts the demo corpus is built from.

One module, because the point of this corpus is that the documents agree with
each other: the SKU in the catalogue is the SKU in the price list is the SKU in
the stock report, the budget in the board minutes is the total of the budget
spreadsheet, and the SLA fee quoted in the sales FAQ is the one in the service
agreement. A demo where two documents contradict each other is worse than no
demo — the prospect's first cross-document question exposes it.

Everything here is fictional. See README.md for the rules that keeps it safe to
show a stranger.
"""

COMPANY = {
    "name": "Acme Industries sp. z o.o.",
    "short": "Acme Industries",
    "street": "ul. Kwiatowa 7",
    "city": "61-001 Poznań",
    "nip": "7792451234",
    "regon": "302145678",
    "krs": "0000412356",
    "email": "kontakt@acme-industries.pl",
    "phone": "+48 61 245 18 00",
    "web": "www.acme-industries.pl",
    "service_portal": "serwis.acme-industries.pl",
}

BOARD = [
    ("Marta Zielińska", "Prezes Zarządu"),
    ("Tomasz Wrona", "Wiceprezes Zarządu ds. operacyjnych"),
    ("Katarzyna Lis", "Dyrektor handlowy"),
    ("Robert Nowak", "Dyrektor personalny"),
    ("Anna Dąbrowska", "Dyrektor finansowy"),
]

WAREHOUSES = [
    ("M1", "Poznań", "ul. Kwiatowa 7", "czynny"),
    ("M2", "Wrocław", "ul. Graniczna 112", "czynny"),
    ("M3", "Gdańsk", "ul. Portowa 4", "uruchomienie 1 czerwca 2026"),
]

# SKU, name, unit, net price PLN, warranty months, lead time days, product line.
# The warranty column is not free: § 6 of the framework agreement grants 24
# months on racking and 12 on everything else, and `verify.py` holds this table
# to it.
PRODUCTS = [
    ("RGM-200", "Regał paletowy Magnus 200", "szt.", 1480.00, 24, 14, "Regały"),
    ("RGM-350", "Regał paletowy Magnus 350", "szt.", 2240.00, 24, 21, "Regały"),
    ("RGP-120", "Regał półkowy Pico 120", "szt.", 640.00, 24, 7, "Regały"),
    ("RGW-080", "Regał wspornikowy Wektor 80", "szt.", 3150.00, 24, 28, "Regały"),
    ("WZR-15", "Wózek paletowy ręczny Rolo 1,5 t", "szt.", 890.00, 12, 7, "Wózki"),
    ("WZU-13", "Wózek unoszący Rolo-U 1,3 t", "szt.", 5700.00, 12, 21, "Wózki"),
    ("WZE-20", "Wózek paletowy elektryczny Rolo-E 2,0 t", "szt.", 12400.00, 12, 35, "Wózki"),
    ("AKB-050", "Belka nośna 50 (para)", "kpl.", 118.00, 12, 3, "Akcesoria"),
    ("AKO-100", "Osłona słupa 100", "szt.", 74.00, 12, 3, "Akcesoria"),
    ("AKS-025", "Siatka zabezpieczająca 2,5 m", "szt.", 310.00, 12, 5, "Akcesoria"),
    ("AKK-001", "Kotwa montażowa M12 (kpl. 10)", "kpl.", 96.00, 12, 3, "Akcesoria"),
]

# Technical parameters, quoted in the catalogue and answerable on their own.
PRODUCT_SPECS = {
    "RGM-200": [
        ("Nośność półki", "2 000 kg"),
        ("Wysokość konstrukcji", "4,5 m"),
        ("Głębokość", "1 100 mm"),
        ("Powłoka", "proszkowa RAL 5010"),
        ("Norma", "PN-EN 15512"),
    ],
    "RGM-350": [
        ("Nośność półki", "3 500 kg"),
        ("Wysokość konstrukcji", "6,0 m"),
        ("Głębokość", "1 100 mm"),
        ("Powłoka", "proszkowa RAL 5010"),
        ("Norma", "PN-EN 15512"),
    ],
    "RGP-120": [
        ("Nośność półki", "120 kg"),
        ("Wysokość konstrukcji", "2,0 m"),
        ("Głębokość", "600 mm"),
        ("Powłoka", "ocynk galwaniczny"),
        ("Norma", "PN-EN 15620"),
    ],
    "RGW-080": [
        ("Nośność ramienia", "800 kg"),
        ("Wysokość konstrukcji", "5,0 m"),
        ("Długość ramienia", "1 200 mm"),
        ("Powłoka", "proszkowa RAL 7016"),
        ("Norma", "PN-EN 15512"),
    ],
    "WZR-15": [
        ("Udźwig", "1 500 kg"),
        ("Długość wideł", "1 150 mm"),
        ("Wysokość podnoszenia", "200 mm"),
        ("Masa własna", "72 kg"),
    ],
    "WZU-13": [
        ("Udźwig", "1 300 kg"),
        ("Wysokość podnoszenia", "800 mm"),
        ("Zasilanie", "akumulator 24 V / 85 Ah"),
        ("Masa własna", "310 kg"),
    ],
    "WZE-20": [
        ("Udźwig", "2 000 kg"),
        ("Prędkość jazdy z ładunkiem", "5,5 km/h"),
        ("Zasilanie", "litowo-jonowe 24 V / 210 Ah"),
        ("Czas ładowania", "2,5 h"),
        ("Masa własna", "640 kg"),
    ],
}

# Quantity thresholds and the discount they unlock. Quoted in the price list,
# the framework agreement and the sales FAQ.
DISCOUNTS = [
    ("1–9 szt.", "0%"),
    ("10–24 szt.", "5%"),
    ("25–49 szt.", "8%"),
    ("50–99 szt.", "12%"),
    ("100 szt. i więcej", "15%"),
]

VAT_RATE = "23%"
PAYMENT_DAYS = 30

# Priority, description, response, fix, availability window
SLA_LEVELS = [
    (
        "P1 — krytyczny",
        "przestój magazynu, wyłączenie regału z eksploatacji lub zagrożenie bezpieczeństwa",
        "4 godziny",
        "24 godziny",
        "24/7",
    ),
    (
        "P2 — poważny",
        "ograniczona funkcjonalność sprzętu bez ryzyka dla bezpieczeństwa",
        "8 godzin roboczych",
        "3 dni robocze",
        "pn–pt 7:00–19:00",
    ),
    (
        "P3 — drobny",
        "usterka kosmetyczna, zużycie eksploatacyjne, zapytanie techniczne",
        "2 dni robocze",
        "10 dni roboczych",
        "pn–pt 7:00–19:00",
    ),
]

SLA_FEE_PERCENT = "3,2%"
SLA_FEE_MINIMUM = "8 400 zł netto rocznie"
SLA_PENALTY_PER_HOUR = "200 zł"
SLA_PENALTY_CAP = "10% rocznej opłaty serwisowej"
SLA_AVAILABILITY_TARGET = "99,0%"
SLA_INSPECTION_INTERVAL = "12 miesięcy"

# 2025 annual report. The segment figures are the ones the sales spreadsheet
# has to add up to.
REVENUE_2025 = {
    "Regały": 27_300_000,
    "Wózki": 15_100_000,
    "Akcesoria": 3_800_000,
    "Serwis": 2_400_000,
}
REVENUE_2024_TOTAL = 42_100_000
EBITDA_2025 = 6_900_000
HEADCOUNT_2025 = 214
HEADCOUNT_2024 = 187
EXPORT_SHARE = "22%"
EXPORT_MARKETS = ["Niemcy", "Czechy", "Litwa"]
LARGEST_CUSTOMER_SHARE = "9,4%"
CAPEX_2025 = "3,1 mln zł (linia lakiernicza w zakładzie w Poznaniu)"
REVENUE_TARGET_2026 = "55 mln zł"

REGIONS = ["Północ", "Południe", "Zachód", "Wschód", "Eksport"]

# Board resolution 1/2026 — the total the marketing budget spreadsheet must hit.
MARKETING_BUDGET_2026 = 1_240_000
MARKETING_CHANNELS = [
    ("Targi branżowe", 0.31),
    ("Reklama online (SEM/SEO)", 0.22),
    ("Materiały drukowane i katalogi", 0.11),
    ("Konferencje i szkolenia dla klientów", 0.14),
    ("Content marketing i PR", 0.12),
    ("Upominki i materiały POS", 0.10),
]

PRICE_INCREASE_2026 = "4,5% od 1 kwietnia 2026"
REFERRAL_BONUS = "3 000 zł"

TOP_CUSTOMERS_2025 = [
    ("Logistyka Wielkopolska S.A.", "Północ", 4_568_000),
    ("Chłodnie Bałtyckie sp. z o.o.", "Północ", 3_120_000),
    ("MetalTrans sp. j.", "Zachód", 2_845_000),
    ("Grupa Spedycyjna Karpaty", "Południe", 2_410_000),
    ("Hansa Lager GmbH", "Eksport", 2_260_000),
    ("Dystrybucja Wschód sp. z o.o.", "Wschód", 1_980_000),
    ("Meblarnia Kaszuby S.A.", "Północ", 1_640_000),
    ("Przemysł Chemiczny Odra S.A.", "Zachód", 1_510_000),
]


# Marketing spend a year earlier, so the 2026 budget can be compared with
# something. Plan 980 000 zł, spent 965 100 zł — 98,5% of plan.
EXECUTION_2025 = [
    ("Targi branżowe", 320_000, 341_200),
    ("Reklama online (SEM/SEO)", 210_000, 198_400),
    ("Materiały drukowane i katalogi", 110_000, 104_600),
    ("Konferencje i szkolenia dla klientów", 140_000, 131_900),
    ("Content marketing i PR", 120_000, 112_700),
    ("Upominki i materiały POS", 80_000, 76_300),
]

# Open purchase orders. WZE-20 and AKS-025 are the two SKUs sitting below their
# minimum stock level, so a question about either has an answer in two
# documents: what is missing, and when it arrives.
INBOUND_ORDERS = [
    ("ZAM/2026/041", "WZE-20", "Wózek paletowy elektryczny Rolo-E 2,0 t", 14,
     "M1 Poznań", "Elektro Handling GmbH", "10 kwietnia 2026", "potwierdzone"),
    ("ZAM/2026/043", "AKS-025", "Siatka zabezpieczająca 2,5 m", 400,
     "M1 Poznań", "Drutex Siatki sp. z o.o.", "18 marca 2026", "potwierdzone"),
    ("ZAM/2026/044", "RGM-200", "Regał paletowy Magnus 200", 260,
     "M3 Gdańsk", "produkcja własna", "25 maja 2026", "w produkcji"),
    ("ZAM/2026/045", "RGP-120", "Regał półkowy Pico 120", 500,
     "M3 Gdańsk", "produkcja własna", "25 maja 2026", "w produkcji"),
    ("ZAM/2026/047", "WZR-15", "Wózek paletowy ręczny Rolo 1,5 t", 80,
     "M2 Wrocław", "Hydro Lift s.r.o.", "2 kwietnia 2026", "potwierdzone"),
    ("ZAM/2026/048", "AKK-001", "Kotwa montażowa M12 (kpl. 10)", 1200,
     "M1 Poznań", "Stalmet sp. j.", "12 marca 2026", "oczekuje na potwierdzenie"),
]
