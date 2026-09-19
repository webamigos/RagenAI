"""
The four PDFs.

Drawn with reportlab through `pdf_kit`, which mirrors `docx_kit`'s calls — so
the content below reads the same whichever format it is headed for, and a
document could be moved between the two by changing one import.
"""

import pdf_kit as k
from data import (
    CAPEX_2025,
    COMPANY,
    DISCOUNTS,
    EBITDA_2025,
    EXPORT_MARKETS,
    EXPORT_SHARE,
    HEADCOUNT_2024,
    HEADCOUNT_2025,
    LARGEST_CUSTOMER_SHARE,
    PRODUCT_SPECS,
    PRODUCTS,
    REVENUE_2024_TOTAL,
    REVENUE_2025,
    REVENUE_TARGET_2026,
    SLA_AVAILABILITY_TARGET,
    SLA_FEE_MINIMUM,
    SLA_FEE_PERCENT,
    SLA_INSPECTION_INTERVAL,
    SLA_LEVELS,
    SLA_PENALTY_CAP,
    SLA_PENALTY_PER_HOUR,
    WAREHOUSES,
)

HEADER = f"{COMPANY['name']}, {COMPANY['street']}, {COMPANY['city']} · NIP {COMPANY['nip']}"


def _money(value: int) -> str:
    return f"{value:,}".replace(",", " ") + " zł"


def _months(count: int) -> str:
    """Polish needs the plural form picked by the number: 12 miesięcy, 24 miesiące."""
    if count % 10 in (2, 3, 4) and count % 100 not in (12, 13, 14):
        return f"{count} miesiące"
    return f"{count} miesięcy"


def _millions(value: int) -> str:
    return f"{value / 1_000_000:.1f}".replace(".", ",") + " mln zł"


def product_catalogue(path: str) -> None:
    document = k.new_document()
    k.title(
        document,
        "Katalog produktów 2026",
        f"{HEADER} · {COMPANY['web']} · tel. {COMPANY['phone']}",
    )
    k.para(
        document,
        "Wyposażenie magazynowe projektowane i produkowane w Poznaniu od 2011 roku. "
        "Wszystkie konstrukcje regałowe spełniają wymagania norm PN-EN 15512 "
        "i PN-EN 15620, a każda dostawa obejmuje kartę produktu z dopuszczalnymi "
        "obciążeniami.",
    )

    for line in ("Regały", "Wózki", "Akcesoria"):
        k.heading(document, line, 1)
        if line == "Regały":
            k.para(
                document,
                "Konstrukcje paletowe, półkowe i wspornikowe do magazynów o wysokości "
                "składowania do 6 metrów. Malowanie proszkowe w standardzie, powłoka "
                "antykorozyjna dla chłodni i obiektów o wilgotności powyżej 80% "
                "za dopłatą 9% ceny katalogowej.",
            )
        elif line == "Wózki":
            k.para(
                document,
                "Wózki paletowe i unoszące o udźwigu od 1,3 do 2,0 tony. Modele "
                "elektryczne dostarczane są z ładowarką i akumulatorem litowo-jonowym; "
                "wymiana akumulatora po okresie gwarancji kosztuje 4 200 zł netto.",
            )
        else:
            k.para(
                document,
                "Elementy uzupełniające konstrukcje regałowe: belki, osłony, siatki "
                "zabezpieczające i kotwy montażowe. Dostępne z magazynu, czas "
                "realizacji od 3 dni roboczych.",
            )

        for sku, name, unit, price, warranty, lead, product_line in PRODUCTS:
            if product_line != line:
                continue
            k.heading(document, f"{name} ({sku})", 2)
            rows = [[label, value] for label, value in PRODUCT_SPECS.get(sku, [])]
            rows.append(["Cena katalogowa netto", f"{price:,.2f}".replace(",", " ").replace(".", ",") + f" zł / {unit}"])
            rows.append(["Gwarancja", _months(warranty)])
            rows.append(["Czas dostawy", f"{lead} dni roboczych"])
            k.table(document, ["Parametr", "Wartość"], rows, widths=[6.5, 9.0])
            # Heading, table and the spacer after it: a product whose name sits
            # alone at the foot of a page reads as a printing accident.
            k.keep_together(document, 3)

    k.heading(document, "Warunki handlowe", 1)
    k.table(
        document,
        ["Wielkość zamówienia", "Rabat od ceny katalogowej"],
        [[threshold, discount] for threshold, discount in DISCOUNTS],
        widths=[7.0, 8.0],
    )
    k.para(
        document,
        "Montaż wyceniany jest na 12% wartości netto zamówionych regałów. Przegląd "
        f"okresowy regałów, wymagany co {SLA_INSPECTION_INTERVAL} zgodnie z normą "
        "PN-EN 15635, kosztuje 1 490 zł netto za lokalizację.",
    )

    k.heading(document, "Kontakt", 1)
    k.para(
        document,
        f"Zamówienia: zamowienia@acme-industries.pl · Serwis: {COMPANY['service_portal']} · "
        f"Centrala: {COMPANY['phone']}",
    )
    k.footer_note(document, f"{COMPANY['name']} · Katalog produktów 2026 · dokument demonstracyjny")
    document.save(path)


def service_agreement(path: str) -> None:
    document = k.new_document()
    k.title(
        document,
        "Umowa serwisowa — warunki SLA",
        f"{HEADER} · załącznik nr 3 do umowy ramowej · wersja 2026.1",
    )

    k.heading(document, "1. Przedmiot i zakres", 1)
    k.para(
        document,
        "Umowa obejmuje serwis gwarancyjny i pogwarancyjny wyposażenia magazynowego "
        "dostarczonego przez Acme Industries: konstrukcji regałowych, wózków "
        "magazynowych oraz akcesoriów. Serwis sprzętu innych producentów nie jest "
        "objęty umową.",
    )
    k.para(
        document,
        "Zgłoszenia przyjmowane są przez portal serwisowy oraz telefonicznie pod "
        f"numerem {COMPANY['phone']}. Każde zgłoszenie otrzymuje numer w formacie "
        "SRV/RRRR/NNNN.",
    )

    k.heading(document, "2. Poziomy zgłoszeń i czasy reakcji", 1)
    k.table(
        document,
        ["Priorytet", "Definicja", "Czas reakcji", "Czas usunięcia", "Okno serwisowe"],
        [[priority, definition, response, fix, window] for priority, definition, response, fix, window in SLA_LEVELS],
        widths=[2.8, 5.6, 2.6, 2.6, 2.4],
    )
    k.para(
        document,
        "Czas reakcji liczony jest od momentu rejestracji zgłoszenia w portalu "
        "serwisowym. Czas usunięcia nie obejmuje okresu oczekiwania na części "
        "zamienne sprowadzane na zamówienie, o ile Dostawca poinformował o tym "
        "Klienta w ciągu 24 godzin od diagnozy.",
    )
    k.para(
        document,
        "Priorytet zgłoszenia nadaje Klient. Dostawca może go obniżyć wyłącznie za "
        "pisemną zgodą Klienta; zgłoszenie dotyczące bezpieczeństwa konstrukcji "
        "pozostaje zawsze na priorytecie P1.",
    )

    k.heading(document, "3. Kary umowne i dostępność", 1)
    k.table(
        document,
        ["Naruszenie", "Kara umowna", "Limit"],
        [
            [
                "Przekroczenie czasu reakcji P1",
                f"{SLA_PENALTY_PER_HOUR} za każdą rozpoczętą godzinę zwłoki",
                SLA_PENALTY_CAP,
            ],
            [
                "Przekroczenie czasu usunięcia P1",
                "500 zł za każdą rozpoczętą dobę zwłoki",
                SLA_PENALTY_CAP,
            ],
            [
                "Przekroczenie czasu reakcji P2",
                "100 zł za każdą rozpoczętą godzinę roboczą zwłoki",
                SLA_PENALTY_CAP,
            ],
            [
                f"Dostępność poniżej {SLA_AVAILABILITY_TARGET} w kwartale",
                "5% kwartalnej opłaty serwisowej za każdy rozpoczęty 0,1 punktu procentowego",
                SLA_PENALTY_CAP,
            ],
        ],
        widths=[5.0, 7.0, 4.0],
    )
    k.para(
        document,
        f"Dostępność serwisu raportowana jest kwartalnie, a cel umowny wynosi "
        f"{SLA_AVAILABILITY_TARGET}. Raport dostępności Dostawca przekazuje do 10. dnia "
        "miesiąca następującego po zakończeniu kwartału.",
    )

    k.heading(document, "4. Opłata serwisowa", 1)
    k.para(
        document,
        f"Roczna opłata serwisowa wynosi {SLA_FEE_PERCENT} wartości netto sprzętu "
        f"objętego umową, nie mniej niż {SLA_FEE_MINIMUM}. Opłata jest fakturowana "
        "kwartalnie z góry, w równych ratach, z terminem płatności 30 dni.",
    )
    k.para(
        document,
        "Opłata obejmuje: przyjmowanie zgłoszeń, diagnozę, robociznę i dojazd "
        "technika. Nie obejmuje części zamiennych, które rozliczane są według "
        "cennika serwisowego z rabatem 15% dla stron umowy.",
    )

    k.heading(document, "5. Przeglądy okresowe", 1)
    k.para(
        document,
        f"Przegląd konstrukcji regałowych wykonywany jest co {SLA_INSPECTION_INTERVAL} "
        "zgodnie z normą PN-EN 15635. Z przeglądu sporządzany jest protokół "
        "z klasyfikacją uszkodzeń w skali zielona–żółta–czerwona. Element "
        "sklasyfikowany jako czerwony wymaga natychmiastowego wyłączenia z "
        "eksploatacji i wymiany w ciągu 5 dni roboczych.",
    )
    k.para(
        document,
        "Brak wykonanego przeglądu w terminie powoduje utratę gwarancji na "
        "konstrukcję i zawieszenie kar umownych po stronie Dostawcy do czasu "
        "wykonania przeglądu.",
    )

    k.heading(document, "6. Wyłączenia", 1)
    k.bullets(
        document,
        [
            "uszkodzenia wynikające z przeciążenia konstrukcji ponad nośność z karty produktu,",
            "skutki kolizji z wózkiem widłowym, jeżeli nie zgłoszono ich w ciągu 24 godzin,",
            "modyfikacje konstrukcji wykonane bez pisemnej zgody Dostawcy,",
            "materiały eksploatacyjne: akumulatory, rolki, uszczelki, oświetlenie,",
            "zdarzenia losowe: pożar, zalanie, przepięcie w sieci zasilającej.",
        ],
    )

    k.heading(document, "7. Czas obowiązywania", 1)
    k.para(
        document,
        "Umowa serwisowa zawierana jest na 12 miesięcy i przedłuża się automatycznie "
        "na kolejne 12 miesięcy, jeżeli żadna ze stron nie złoży oświadczenia "
        "o jej nieprzedłużaniu na 60 dni przed końcem okresu.",
    )

    k.footer_note(document, f"{COMPANY['name']} · Warunki SLA 2026.1 · dokument demonstracyjny")
    document.save(path)


def annual_report(path: str) -> None:
    document = k.new_document()
    total_2025 = sum(REVENUE_2025.values())
    growth = (total_2025 - REVENUE_2024_TOTAL) / REVENUE_2024_TOTAL * 100

    k.title(
        document,
        "Raport roczny 2025",
        f"{HEADER} · sprawozdanie zarządu z działalności, marzec 2026",
    )

    k.heading(document, "List prezesa zarządu", 1)
    k.para(
        document,
        f"Rok 2025 zamknęliśmy przychodem {_millions(total_2025)} wobec "
        f"{_millions(REVENUE_2024_TOTAL)} rok wcześniej, co oznacza wzrost o "
        f"{growth:.1f}".replace(".", ",")
        + "%. Wzrost pochodził w większości ze sprzedaży konstrukcji regałowych "
        "oraz z rynków eksportowych, gdzie rozpoczęliśmy współpracę z trzema "
        "nowymi dystrybutorami.",
    )
    k.para(
        document,
        "Najważniejszą decyzją roku było uruchomienie własnej linii lakierniczej, "
        "które skróciło czas realizacji zamówień na regały malowane proszkowo "
        "z 28 do 14 dni roboczych.",
    )
    k.para(document, "Marta Zielińska, Prezes Zarządu")

    k.heading(document, "Wyniki finansowe", 1)
    k.table(
        document,
        ["Wskaźnik", "2025", "2024", "Zmiana"],
        [
            ["Przychód ze sprzedaży", _money(total_2025), _money(REVENUE_2024_TOTAL), f"+{growth:.1f}%".replace(".", ",")],
            ["EBITDA", _money(EBITDA_2025), _money(5_100_000), "+35,3%"],
            ["Marża EBITDA", "14,2%", "12,1%", "+2,1 p.p."],
            ["Zatrudnienie na koniec roku", f"{HEADCOUNT_2025} osób", f"{HEADCOUNT_2024} osób", "+27 osób"],
            ["Udział eksportu w przychodzie", EXPORT_SHARE, "17%", "+5 p.p."],
        ],
        widths=[5.5, 3.5, 3.5, 3.0],
    )

    k.heading(document, "Sprzedaż według segmentów", 1)
    k.table(
        document,
        ["Segment", "Przychód 2025", "Udział"],
        [
            [segment, _money(value), f"{value / total_2025 * 100:.1f}%".replace(".", ",")]
            for segment, value in REVENUE_2025.items()
        ]
        + [["Razem", _money(total_2025), "100,0%"]],
        widths=[5.0, 5.5, 4.0],
    )
    k.para(
        document,
        "Segment serwisowy, choć najmniejszy, rośnie najszybciej: liczba klientów "
        "z aktywną umową serwisową wzrosła z 41 do 68. Umowy serwisowe są dla nas "
        "przychodem powtarzalnym i priorytetem sprzedażowym na rok 2026.",
    )

    k.heading(document, "Rynki i klienci", 1)
    k.para(
        document,
        f"Eksport odpowiadał za {EXPORT_SHARE} przychodu. Główne rynki to "
        f"{', '.join(EXPORT_MARKETS)}. Największy klient odpowiadał za "
        f"{LARGEST_CUSTOMER_SHARE} przychodu — utrzymujemy przyjętą przez zarząd "
        "zasadę, że żaden pojedynczy klient nie przekracza 10%.",
    )

    k.heading(document, "Inwestycje", 1)
    k.para(document, f"Nakłady inwestycyjne w 2025 roku wyniosły {CAPEX_2025}.")
    k.para(
        document,
        "W 2026 roku planujemy uruchomienie magazynu regionalnego w Gdańsku "
        "(1 czerwca 2026) z budżetem 2 400 000 zł oraz rekrutację 12 osób do "
        "jego obsługi.",
    )

    k.heading(document, "Zasoby i lokalizacje", 1)
    k.table(
        document,
        ["Kod", "Lokalizacja", "Adres", "Status"],
        [[code, city, address, status] for code, city, address, status in WAREHOUSES],
        widths=[2.0, 3.5, 5.5, 5.0],
    )

    k.heading(document, "Perspektywy na 2026 rok", 1)
    k.para(
        document,
        f"Celem przychodowym na rok 2026 jest {REVENUE_TARGET_2026}, z udziałem "
        "eksportu na poziomie 26%. Cel zakłada podwyżkę cen katalogowych o 4,5% "
        "od 1 kwietnia 2026 oraz pełne uruchomienie magazynu w Gdańsku w drugim "
        "półroczu.",
    )
    k.para(
        document,
        "Głównym ryzykiem pozostaje dostępność komponentów do wózków elektrycznych, "
        "gdzie czas dostawy od producenta wynosi 35 dni roboczych.",
    )

    k.footer_note(document, f"{COMPANY['name']} · Raport roczny 2025 · dokument demonstracyjny")
    document.save(path)


def employee_handbook(path: str) -> None:
    document = k.new_document(language="en-GB")
    k.title(
        document,
        "Employee Handbook 2026",
        f"{COMPANY['name']} · {COMPANY['street']}, {COMPANY['city']} · "
        "English summary of the Polish staff regulations",
    )
    k.para(
        document,
        "This handbook summarises the rules that apply to every Acme Industries "
        "employee. Where it differs from the Polish-language regulations, the "
        "Polish text prevails. It is maintained by the HR department and was last "
        "updated on 1 March 2026.",
    )

    k.heading(document, "1. Working time", 1)
    k.para(
        document,
        "Standard working time is 8 hours a day and 40 hours a week, Monday to "
        "Friday. Core hours, when everyone is expected to be reachable, are 9:00 "
        "to 15:00. Overtime is approved in advance by the line manager and is "
        "compensated with time off at a 1:1 ratio within the same settlement "
        "period, or paid according to the Labour Code.",
    )

    k.heading(document, "2. Remote work", 1)
    k.para(
        document,
        "Office-based employees may work remotely for up to 12 days per calendar "
        "month. Requests are submitted in Workday at least 3 working days in "
        "advance and the manager answers within 24 hours. Warehouse and production "
        "roles are excluded.",
    )
    k.para(
        document,
        "A monthly allowance of PLN 180 covers electricity and internet costs for "
        "employees who work remotely. It is paid together with the monthly salary.",
    )

    k.heading(document, "3. Leave", 1)
    k.table(
        document,
        ["Type of leave", "Entitlement", "Notice"],
        [
            ["Annual leave — over 10 years of service", "26 working days", "14 days for absences longer than 5 days"],
            ["Annual leave — under 10 years of service", "20 working days", "14 days for absences longer than 5 days"],
            ["Leave on demand", "4 days per year", "same day, by 9:00"],
            ["Unpaid leave over 30 days", "by agreement", "written approval of the HR director"],
            ["Volunteering day", "1 day per year", "7 days"],
        ],
        widths=[6.0, 4.5, 5.5],
    )
    k.para(
        document,
        "Unused annual leave carries over to the next year and must be taken by "
        "30 September.",
    )

    k.heading(document, "4. Benefits", 1)
    k.table(
        document,
        ["Benefit", "What the company covers", "Employee contribution"],
        [
            ["Private healthcare (Medicover)", "full cost for the employee", "PLN 95 per month for a family package"],
            ["Multisport card", "PLN 120 per month", "PLN 60 per month"],
            ["Life insurance", "full cost", "none"],
            ["Training budget", "PLN 4 000 per employee per year", "none"],
            ["Learning days", "4 paid days per year", "none"],
            ["Referral bonus", "PLN 3 000 after 3 months of the referred hire", "none"],
        ],
        widths=[5.0, 6.5, 4.5],
    )
    k.para(
        document,
        "The training budget covers courses, certifications and conference tickets "
        "related to the employee's role. Requests above PLN 2 000 need the "
        "director's approval.",
    )

    k.heading(document, "5. Expenses and business travel", 1)
    k.para(
        document,
        "Expense claims are filed in Expensify within 30 days of the end of the "
        "trip; claims filed later are not processed. A VAT invoice issued to Acme "
        "Industries sp. z o.o. is required — a receipt alone is not sufficient.",
    )
    k.table(
        document,
        ["Item", "Limit"],
        [
            ["Accommodation in Poland", "PLN 450 per night"],
            ["Accommodation abroad", "EUR 140 per night"],
            ["Domestic per diem", "PLN 45 per day"],
            ["Private car mileage", "PLN 1.15 per kilometre"],
        ],
        widths=[8.0, 7.0],
    )
    k.para(
        document,
        "Reimbursement is paid within 14 days of the manager approving the claim.",
    )

    k.heading(document, "6. Onboarding", 1)
    k.para(
        document,
        "New joiners receive a laptop, an access badge and a company email account "
        "on day one; IT creates the account no later than the day before the start "
        "date. Health and safety training takes 4 hours and GDPR training 2 hours, "
        "both in the first week. Every new joiner is assigned a buddy for the first "
        "3 months, meeting at least weekly. The probation period is 3 months and "
        "the summary conversation takes place in week 11.",
    )

    k.heading(document, "7. Code of conduct and whistleblowing", 1)
    k.para(
        document,
        "Acme Industries does not tolerate harassment, discrimination or any form "
        "of bribery. Gifts from contractors above PLN 200 in value must be reported "
        "to the compliance officer and are recorded in the gift register.",
    )
    k.para(
        document,
        "Concerns can be reported anonymously through the whistleblowing channel at "
        "sygnalista.acme-industries.pl. Reports are acknowledged within 7 days and "
        "resolved within 3 months. Retaliation against a person who reports in good "
        "faith is a serious breach of employee duties.",
    )

    k.heading(document, "8. Information security", 1)
    k.bullets(
        document,
        [
            "company data is stored in company systems only — no private cloud drives,",
            "laptops are encrypted and screens lock after 5 minutes of inactivity,",
            "passwords are kept in the company password manager and never shared,",
            "a lost device is reported to IT within 24 hours,",
            "customer data leaves the company only under a signed data processing agreement.",
        ],
    )

    k.footer_note(document, f"{COMPANY['name']} · Employee Handbook 2026 · demonstration document")
    document.save(path)
