"""
The arithmetic behind the spreadsheets.

Totals are forced, not approximated: every breakdown is rounded to full
thousands and the last row absorbs the rounding, so a prospect who adds up a
column gets the figure the annual report quotes. That is the whole trick that
makes "ile wyniósł przychód w 2025?" and "zsumuj sprzedaż regałów po
miesiącach" agree.
"""

from data import (
    MARKETING_BUDGET_2026,
    MARKETING_CHANNELS,
    PRODUCTS,
    REGIONS,
    REVENUE_2025,
)

MONTHS = [
    "styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec",
    "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień",
]

QUARTERS = ["Q1", "Q2", "Q3", "Q4"]

# Warehouse trade is slow in January and peaks before the year closes.
SEASONALITY = {
    "Regały":    [0.061, 0.067, 0.084, 0.089, 0.091, 0.088, 0.072, 0.070, 0.092, 0.098, 0.096, 0.092],
    "Wózki":     [0.068, 0.071, 0.086, 0.087, 0.084, 0.082, 0.074, 0.073, 0.089, 0.094, 0.097, 0.095],
    "Akcesoria": [0.074, 0.076, 0.083, 0.085, 0.086, 0.084, 0.079, 0.078, 0.086, 0.090, 0.090, 0.089],
    "Serwis":    [0.081, 0.081, 0.084, 0.084, 0.084, 0.083, 0.082, 0.082, 0.084, 0.085, 0.085, 0.085],
}

# Eksport is 0.22 because the annual report says export was 22% of revenue, and
# the two have to agree — a prospect who reads both is exactly the reader this
# corpus is for. Północ stays the largest domestic region.
REGION_SHARE = {
    "Północ": 0.27,
    "Południe": 0.18,
    "Zachód": 0.22,
    "Wschód": 0.11,
    "Eksport": 0.22,
}

QUARTER_SHARE = [0.22, 0.26, 0.23, 0.29]


def _split(total: int, weights: list[float], step: int = 1000) -> list[int]:
    """Split `total` by `weights`, rounded to `step`, last item absorbing the rest."""
    parts = [round(total * w / step) * step for w in weights[:-1]]
    parts.append(total - sum(parts))
    return parts


def monthly_by_segment() -> dict[str, list[int]]:
    """12 monthly figures per segment, each row summing to the segment's year."""
    return {
        segment: _split(year, SEASONALITY[segment])
        for segment, year in REVENUE_2025.items()
    }


def quarterly_by_region() -> dict[str, list[int]]:
    """4 quarterly figures per region, the whole table summing to the year."""
    total = sum(REVENUE_2025.values())
    region_totals = _split(total, [REGION_SHARE[r] for r in REGIONS])
    return {
        region: _split(region_total, QUARTER_SHARE)
        for region, region_total in zip(REGIONS, region_totals)
    }


def marketing_budget() -> dict[str, list[int]]:
    """Channel × quarter, summing to board resolution 1/2026."""
    channel_totals = _split(
        MARKETING_BUDGET_2026, [share for _, share in MARKETING_CHANNELS], step=500
    )
    # Trade fairs cluster in Q1 and Q3, everything else runs flat.
    shapes = {
        "Targi branżowe": [0.38, 0.12, 0.35, 0.15],
        "Konferencje i szkolenia dla klientów": [0.20, 0.30, 0.20, 0.30],
    }
    out = {}
    for (channel, _), channel_total in zip(MARKETING_CHANNELS, channel_totals):
        shape = shapes.get(channel, [0.25, 0.25, 0.25, 0.25])
        out[channel] = _split(channel_total, shape, step=500)
    return out


# SKU → per-warehouse stock, minimum level and last stocktake. Gdańsk (M3) opens
# in June 2026, so it holds nothing yet — which is itself an answerable fact.
STOCK = {
    "RGM-200": {"M1": 412, "M2": 188, "M3": 0, "min": 250, "inwentaryzacja": "2026-01-31"},
    "RGM-350": {"M1": 96, "M2": 54, "M3": 0, "min": 80, "inwentaryzacja": "2026-01-31"},
    "RGP-120": {"M1": 1340, "M2": 760, "M3": 0, "min": 600, "inwentaryzacja": "2026-02-28"},
    "RGW-080": {"M1": 38, "M2": 12, "M3": 0, "min": 30, "inwentaryzacja": "2026-01-31"},
    "WZR-15": {"M1": 204, "M2": 143, "M3": 0, "min": 120, "inwentaryzacja": "2026-02-28"},
    "WZU-13": {"M1": 27, "M2": 9, "M3": 0, "min": 20, "inwentaryzacja": "2026-02-28"},
    "WZE-20": {"M1": 7, "M2": 3, "M3": 0, "min": 12, "inwentaryzacja": "2026-02-28"},
    "AKB-050": {"M1": 2480, "M2": 1310, "M3": 0, "min": 1500, "inwentaryzacja": "2026-02-28"},
    "AKO-100": {"M1": 1870, "M2": 940, "M3": 0, "min": 800, "inwentaryzacja": "2026-02-28"},
    "AKS-025": {"M1": 210, "M2": 120, "M3": 0, "min": 400, "inwentaryzacja": "2026-01-31"},
    "AKK-001": {"M1": 3150, "M2": 1720, "M3": 0, "min": 1200, "inwentaryzacja": "2026-02-28"},
}

PRODUCT_BY_SKU = {sku: row for row in PRODUCTS for sku in [row[0]]}
