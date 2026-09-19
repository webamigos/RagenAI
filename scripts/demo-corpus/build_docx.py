"""
The four Word documents.

Each one is written so that a question about it has exactly one answer with a
number, a date or a name in it — a demo answer that says "to zależy" proves
nothing. Facts shared with another document (discount thresholds, the SLA fee,
the marketing budget) are imported from `data`, never retyped.
"""

import docx_kit as k
from data import (
    BOARD,
    COMPANY,
    DISCOUNTS,
    MARKETING_BUDGET_2026,
    PAYMENT_DAYS,
    PRICE_INCREASE_2026,
    PRODUCTS,
    REFERRAL_BONUS,
    SLA_FEE_MINIMUM,
    SLA_FEE_PERCENT,
    SLA_INSPECTION_INTERVAL,
    SLA_LEVELS,
)

HEADER = f"{COMPANY['name']}, {COMPANY['street']}, {COMPANY['city']} · NIP {COMPANY['nip']}"


def framework_agreement(path: str) -> None:
    document = k.new_document()
    k.title(
        document,
        "Umowa ramowa dostawy nr 04/2026",
        f"{HEADER} · zawarta w Poznaniu 15 stycznia 2026 roku",
    )

    k.para(
        document,
        "zawarta pomiędzy Acme Industries sp. z o.o. z siedzibą w Poznaniu przy "
        f"ul. Kwiatowej 7, wpisaną do rejestru przedsiębiorców KRS pod numerem "
        f"{COMPANY['krs']}, NIP {COMPANY['nip']}, reprezentowaną przez Martę "
        "Zielińską — Prezesa Zarządu, zwaną dalej Dostawcą,",
    )
    k.para(
        document,
        "a Logistyka Wielkopolska S.A. z siedzibą w Swarzędzu przy ul. Składowej 22, "
        "NIP 7773012988, reprezentowaną przez Piotra Malinowskiego — Członka "
        "Zarządu, zwaną dalej Odbiorcą.",
    )

    k.heading(document, "§ 1. Przedmiot umowy", 2)
    k.para(
        document,
        "Dostawca zobowiązuje się do sprzedaży i dostarczania Odbiorcy wyposażenia "
        "magazynowego z aktualnej oferty katalogowej, a Odbiorca do jego odbioru "
        "i zapłaty ceny. Umowa określa warunki ramowe; sprzedaż następuje na "
        "podstawie zamówień jednostkowych.",
    )

    k.heading(document, "§ 2. Zamówienia", 2)
    k.numbered(
        document,
        [
            "Zamówienia składa się drogą elektroniczną na adres zamowienia@acme-industries.pl.",
            "Dostawca potwierdza przyjęcie zamówienia w terminie 2 dni roboczych. "
            "Brak potwierdzenia w tym terminie oznacza nieprzyjęcie zamówienia.",
            "Minimalna wartość jednego zamówienia wynosi 2 500 zł netto.",
            "Zmiana lub anulowanie potwierdzonego zamówienia wymaga zgody Dostawcy "
            "i jest bezpłatna do 3 dni roboczych od potwierdzenia.",
        ],
    )

    k.heading(document, "§ 3. Ceny i rabaty", 2)
    k.para(
        document,
        "Ceny określa cennik stanowiący załącznik nr 1 do umowy. Dostawca może "
        "zmienić ceny katalogowe nie częściej niż raz na 6 miesięcy, zawiadamiając "
        f"Odbiorcę na 30 dni przed zmianą. Zaplanowana zmiana cen: {PRICE_INCREASE_2026}.",
    )
    k.para(document, "Rabaty progowe liczone są osobno dla każdej pozycji zamówienia:")
    k.table(
        document,
        ["Wielkość zamówienia", "Rabat"],
        [[threshold, discount] for threshold, discount in DISCOUNTS],
        widths=[8.0, 4.0],
    )
    k.para(
        document,
        "Odbiorcy przysługuje dodatkowy rabat lojalnościowy w wysokości 3% od cen "
        "katalogowych, jeżeli wartość zamówień w poprzednim roku kalendarzowym "
        "przekroczyła 2 000 000 zł netto. Rabaty nie sumują się z rabatami "
        "promocyjnymi.",
    )

    k.heading(document, "§ 4. Dostawa", 2)
    k.numbered(
        document,
        [
            "Termin dostawy wynosi 14 dni roboczych od potwierdzenia zamówienia, "
            "chyba że karta produktu przewiduje termin dłuższy.",
            "Dostawa następuje na warunkach DAP zgodnie z Incoterms 2020, do "
            "magazynu Odbiorcy wskazanego w zamówieniu.",
            "Transport jest bezpłatny dla zamówień o wartości powyżej 15 000 zł netto.",
            "Odbiorca sprawdza zgodność dostawy w chwili odbioru i zgłasza braki "
            "ilościowe w protokole odbioru.",
        ],
    )

    k.heading(document, "§ 5. Płatności", 2)
    k.para(
        document,
        f"Termin płatności wynosi {PAYMENT_DAYS} dni od daty wystawienia faktury. "
        "Za dzień zapłaty uznaje się dzień uznania rachunku Dostawcy. W razie "
        "opóźnienia Dostawcy przysługują odsetki ustawowe za opóźnienie "
        "w transakcjach handlowych.",
    )
    k.para(
        document,
        "Limit kredytu kupieckiego Odbiorcy wynosi 600 000 zł. Po jego przekroczeniu "
        "Dostawca może wstrzymać realizację kolejnych zamówień do czasu "
        "uregulowania zaległości.",
    )

    k.heading(document, "§ 6. Gwarancja", 2)
    k.para(
        document,
        "Dostawca udziela gwarancji na okres 24 miesięcy na konstrukcje regałowe "
        "oraz 12 miesięcy na wózki magazynowe i akcesoria, licząc od daty dostawy. "
        "Warunkiem utrzymania gwarancji na regały jest wykonanie przeglądu "
        f"okresowego co {SLA_INSPECTION_INTERVAL} zgodnie z normą PN-EN 15635.",
    )

    k.heading(document, "§ 7. Kary umowne", 2)
    k.table(
        document,
        ["Zdarzenie", "Kara umowna", "Limit"],
        [
            ["Zwłoka w dostawie", "0,2% wartości netto opóźnionej dostawy za każdy dzień", "15% wartości zamówienia"],
            ["Zwłoka w usunięciu wady", "0,1% wartości netto wadliwego towaru za każdy dzień", "10% wartości zamówienia"],
            ["Odstąpienie z winy strony", "10% wartości niezrealizowanej części umowy", "—"],
            ["Naruszenie poufności", "50 000 zł za każde naruszenie", "—"],
        ],
        widths=[5.0, 7.0, 4.5],
    )
    k.para(
        document,
        "Łączna odpowiedzialność Dostawcy z tytułu umowy nie przekracza 100% "
        "wartości zamówień zrealizowanych w ostatnich 12 miesiącach.",
    )

    k.heading(document, "§ 8. Poufność i dane osobowe", 2)
    k.para(
        document,
        "Strony zachowują w poufności informacje handlowe i techniczne uzyskane "
        "w związku z umową, przez czas jej obowiązywania i 3 lata po jej "
        "zakończeniu. Powierzenie przetwarzania danych osobowych reguluje "
        "załącznik nr 2 (umowa powierzenia zgodna z RODO).",
    )

    k.heading(document, "§ 9. Czas trwania i wypowiedzenie", 2)
    k.para(
        document,
        "Umowa zostaje zawarta na 24 miesiące, z możliwością przedłużenia na "
        "kolejne 12 miesięcy w drodze aneksu. Każda ze stron może ją wypowiedzieć "
        "z zachowaniem 3-miesięcznego okresu wypowiedzenia ze skutkiem na koniec "
        "miesiąca kalendarzowego. Zamówienia potwierdzone przed wypowiedzeniem "
        "są realizowane na dotychczasowych warunkach.",
    )

    k.heading(document, "§ 10. Postanowienia końcowe", 2)
    k.para(
        document,
        "Zmiany umowy wymagają formy pisemnej pod rygorem nieważności. Spory "
        "rozstrzyga sąd właściwy dla siedziby Dostawcy w Poznaniu. W sprawach "
        "nieuregulowanych stosuje się przepisy Kodeksu cywilnego.",
    )
    k.para(document, "Załączniki: nr 1 — cennik 2026; nr 2 — umowa powierzenia przetwarzania danych.")

    k.footer_note(document, f"{COMPANY['name']} · Umowa ramowa dostawy nr 04/2026 · dokument demonstracyjny")
    document.save(path)


def complaints_procedure(path: str) -> None:
    document = k.new_document()
    k.title(
        document,
        "Procedura reklamacyjna P-07",
        f"{HEADER} · wersja 3.1, obowiązuje od 1 lutego 2026",
    )

    k.heading(document, "1. Cel i zakres", 2)
    k.para(
        document,
        "Procedura określa sposób przyjmowania, rozpatrywania i zamykania "
        "reklamacji dotyczących wyposażenia magazynowego sprzedanego przez Acme "
        "Industries. Obowiązuje dział serwisu, dział handlowy i magazyn.",
    )

    k.heading(document, "2. Zgłoszenie reklamacji", 2)
    k.para(
        document,
        f"Reklamacje przyjmowane są przez portal {COMPANY['service_portal']} oraz "
        "pocztą elektroniczną na adres reklamacje@acme-industries.pl. Zgłoszenie "
        "musi zawierać numer faktury, SKU produktu, opis wady i zdjęcia.",
    )
    k.table(
        document,
        ["Rodzaj wady", "Termin zgłoszenia", "Podstawa"],
        [
            ["Wada jawna (widoczna przy odbiorze)", "7 dni od daty dostawy", "protokół odbioru"],
            ["Braki ilościowe", "3 dni robocze od daty dostawy", "protokół odbioru"],
            ["Wada ukryta", "14 dni od wykrycia, w okresie gwarancji", "karta gwarancyjna"],
            ["Uszkodzenie w transporcie", "24 godziny od dostawy", "protokół szkody przewoźnika"],
        ],
        widths=[6.0, 6.0, 4.5],
    )

    k.heading(document, "3. Terminy rozpatrzenia", 2)
    k.table(
        document,
        ["Etap", "Termin", "Odpowiedzialny"],
        [
            ["Potwierdzenie przyjęcia zgłoszenia", "1 dzień roboczy", "specjalista ds. serwisu"],
            ["Oględziny u klienta (jeśli wymagane)", "5 dni roboczych od przyjęcia", "technik serwisu"],
            ["Decyzja o uznaniu lub odrzuceniu", "14 dni kalendarzowych od zgłoszenia", "kierownik serwisu"],
            ["Naprawa lub wymiana towaru", "21 dni od uznania reklamacji", "dział serwisu"],
            ["Zwrot środków", "14 dni od uznania reklamacji", "dział finansowy"],
            ["Odwołanie klienta od decyzji", "14 dni od doręczenia decyzji", "dyrektor handlowy"],
        ],
        widths=[6.5, 5.5, 4.5],
    )
    k.para(
        document,
        "Brak decyzji w terminie 14 dni kalendarzowych oznacza uznanie reklamacji "
        "zgodnie z art. 5615 Kodeksu cywilnego.",
    )

    k.heading(document, "4. Reklamacje nieuznawane", 2)
    k.bullets(
        document,
        [
            "uszkodzenia mechaniczne powstałe z winy użytkownika, w tym najechanie wózkiem na ramę regału,",
            "przeciążenie konstrukcji ponad nośność podaną w karcie produktu,",
            "montaż niezgodny z instrukcją lub przez ekipę nieautoryzowaną przez Dostawcę,",
            f"brak udokumentowanego przeglądu okresowego wykonywanego co {SLA_INSPECTION_INTERVAL},",
            "zużycie eksploatacyjne elementów wymiennych: rolek, akumulatorów, uszczelek,",
            "korozja powierzchniowa w obiektach o wilgotności powyżej 80% bez zamówionej powłoki antykorozyjnej.",
        ],
    )

    k.heading(document, "5. Klasyfikacja i eskalacja", 2)
    k.para(
        document,
        "Reklamacja dotycząca bezpieczeństwa konstrukcji jest zawsze traktowana "
        "jako priorytet P1 zgodnie z umową serwisową i podlega natychmiastowej "
        "eskalacji do kierownika serwisu oraz wiceprezesa ds. operacyjnych. "
        "Do czasu oględzin regał zostaje wyłączony z eksploatacji.",
    )

    k.heading(document, "6. Rejestr i wskaźniki", 2)
    k.para(
        document,
        "Wszystkie zgłoszenia rejestrowane są w systemie serwisowym z numerem "
        "w formacie REK/RRRR/NNN. Dział serwisu raportuje kwartalnie trzy "
        "wskaźniki: liczbę reklamacji na 1 000 sprzedanych sztuk (cel: poniżej 4), "
        "udział reklamacji uznanych (cel: poniżej 60%) oraz średni czas zamknięcia "
        "(cel: poniżej 18 dni).",
    )

    k.footer_note(document, f"{COMPANY['name']} · Procedura reklamacyjna P-07 · dokument demonstracyjny")
    document.save(path)


def board_minutes(path: str) -> None:
    document = k.new_document()
    k.title(
        document,
        "Protokół z posiedzenia Zarządu",
        f"{HEADER} · posiedzenie nr 2/2026, Poznań, 12 lutego 2026",
    )

    k.heading(document, "Uczestnicy", 2)
    # Spelled out rather than derived: a Polish surname does not tell you which
    # form to use, and a demo document that misgenders its own board is a bad
    # look in front of a prospect.
    attendance = {
        "Marta Zielińska": "obecna",
        "Tomasz Wrona": "obecny",
        "Katarzyna Lis": "obecna",
        "Robert Nowak": "obecny",
        "Anna Dąbrowska": "obecna",
    }
    k.table(
        document,
        ["Imię i nazwisko", "Funkcja", "Obecność"],
        [[name, role, attendance[name]] for name, role in BOARD],
        widths=[5.5, 7.0, 3.5],
    )
    k.para(
        document,
        "Posiedzenie otworzyła Marta Zielińska o godzinie 10:00. Protokołowała "
        "Joanna Sikora, asystentka zarządu. Kworum zostało stwierdzone.",
    )

    k.heading(document, "1. Wyniki 2025", 2)
    k.para(
        document,
        "Dyrektor finansowy przedstawiła wyniki roku 2025: przychód 48,6 mln zł "
        "wobec 42,1 mln zł w roku 2024, EBITDA 6,9 mln zł, marża EBITDA 14,2%. "
        "Zarząd przyjął wyniki bez uwag.",
    )

    k.heading(document, "2. Podjęte uchwały", 2)
    k.table(
        document,
        ["Numer", "Treść uchwały", "Głosowanie"],
        [
            [
                "1/2026",
                f"Zatwierdzenie budżetu marketingowego na rok 2026 w wysokości "
                f"{MARKETING_BUDGET_2026:,} zł netto.".replace(",", " "),
                "jednogłośnie",
            ],
            [
                "2/2026",
                "Uruchomienie magazynu regionalnego w Gdańsku (M3) z dniem "
                "1 czerwca 2026. Budżet uruchomienia: 2 400 000 zł.",
                "4 za, 1 wstrzymujący",
            ],
            [
                "3/2026",
                f"Podwyżka cen katalogowych o {PRICE_INCREASE_2026}. Klienci "
                "z umowami ramowymi otrzymują zawiadomienie 30 dni przed zmianą.",
                "jednogłośnie",
            ],
            [
                "4/2026",
                f"Wprowadzenie programu poleceń pracowniczych z premią {REFERRAL_BONUS} "
                "brutto, wypłacaną po 3 miesiącach pracy poleconego kandydata.",
                "jednogłośnie",
            ],
            [
                "5/2026",
                "Zwiększenie budżetu szkoleniowego na pracownika do 4 000 zł rocznie.",
                "jednogłośnie",
            ],
        ],
        widths=[2.2, 9.3, 4.5],
    )

    k.heading(document, "3. Dyskusja", 2)
    k.para(
        document,
        "Tomasz Wrona zwrócił uwagę, że stan magazynowy wózków elektrycznych "
        "Rolo-E 2,0 t (WZE-20) spadł poniżej zapasu minimalnego, a czas dostawy od "
        "producenta komponentów wynosi 35 dni roboczych. Zarząd zobowiązał go do "
        "przedstawienia planu uzupełnienia zapasu do 28 lutego 2026.",
    )
    k.para(
        document,
        "Katarzyna Lis przedstawiła cel przychodowy na rok 2026 w wysokości "
        "55 mln zł, z czego 26% ma pochodzić z eksportu. Zarząd przyjął cel "
        "do realizacji.",
    )

    k.heading(document, "4. Zadania i terminy", 2)
    k.table(
        document,
        ["Zadanie", "Odpowiedzialny", "Termin"],
        [
            ["Plan uzupełnienia zapasu WZE-20", "Tomasz Wrona", "28 lutego 2026"],
            ["Zawiadomienia o zmianie cen dla klientów umownych", "Katarzyna Lis", "1 marca 2026"],
            ["Umowa najmu powierzchni magazynowej w Gdańsku", "Anna Dąbrowska", "31 marca 2026"],
            ["Regulamin programu poleceń pracowniczych", "Robert Nowak", "15 marca 2026"],
            ["Rekrutacja 12 osób do magazynu M3", "Robert Nowak", "30 kwietnia 2026"],
        ],
        widths=[8.0, 4.5, 3.5],
    )

    k.para(
        document,
        "Posiedzenie zamknięto o godzinie 12:40. Kolejne posiedzenie zaplanowano "
        "na 9 kwietnia 2026.",
    )

    k.footer_note(document, f"{COMPANY['name']} · Protokół 2/2026 · dokument demonstracyjny")
    document.save(path)


def sales_faq(path: str) -> None:
    document = k.new_document()
    k.title(
        document,
        "FAQ dla działu handlowego",
        f"{HEADER} · aktualizacja: 1 marca 2026",
    )
    k.para(
        document,
        "Odpowiedzi na pytania, które najczęściej zadają klienci. Każda odpowiedź "
        "wskazuje dokument źródłowy — w razie wątpliwości obowiązuje treść "
        "dokumentu, nie tego zestawienia.",
    )

    questions = [
        (
            "Jaki rabat dostanie klient przy zamówieniu 60 sztuk jednego produktu?",
            "12%. Próg 50–99 sztuk liczy się osobno dla każdej pozycji zamówienia, "
            "a nie dla wartości całego zamówienia. Klient z umową ramową i obrotem "
            "powyżej 2 mln zł w poprzednim roku dostaje dodatkowo 3% rabatu "
            "lojalnościowego. Źródło: cennik 2026, arkusz „Rabaty i warunki”, "
            "oraz § 3 umowy ramowej.",
        ),
        (
            "Ile wynosi termin płatności i czy można go wydłużyć?",
            f"Standardowo {PAYMENT_DAYS} dni od daty wystawienia faktury. Wydłużenie "
            "do 45 dni wymaga zgody dyrektora finansowego i jest możliwe wyłącznie "
            "dla klientów bez zaległości w ostatnich 12 miesiącach. Źródło: § 5 "
            "umowy ramowej.",
        ),
        (
            "Kiedy transport jest bezpłatny?",
            "Przy zamówieniu powyżej 15 000 zł netto. Poniżej tej kwoty koszt "
            "transportu wycenia dział logistyki według adresu dostawy. Minimum "
            "logistyczne to 2 500 zł netto na zamówienie. Źródło: cennik 2026 "
            "i § 4 umowy ramowej.",
        ),
        (
            "Jak długa jest gwarancja?",
            "24 miesiące na konstrukcje regałowe, 12 miesięcy na wózki magazynowe "
            "i akcesoria. Gwarancja na regały wymaga udokumentowanego przeglądu "
            f"okresowego co {SLA_INSPECTION_INTERVAL}. Źródło: § 6 umowy ramowej.",
        ),
        (
            "Ile kosztuje umowa serwisowa?",
            f"{SLA_FEE_PERCENT} wartości sprzedanego sprzętu w skali roku, nie mniej "
            f"niż {SLA_FEE_MINIMUM}. Umowa obejmuje trzy poziomy zgłoszeń: P1, P2 "
            "i P3. Źródło: umowa serwisowa SLA, rozdział 4.",
        ),
        (
            "Jaki jest czas reakcji na awarię krytyczną?",
            f"{SLA_LEVELS[0][2]} w trybie {SLA_LEVELS[0][4]}, a usunięcie awarii "
            f"{SLA_LEVELS[0][3]}. Za każdą rozpoczętą godzinę zwłoki w reakcji P1 "
            "klientowi przysługuje kara umowna. Źródło: umowa serwisowa SLA, "
            "rozdział 2.",
        ),
        (
            "Klient zgłasza wadę po pięciu miesiącach od dostawy — czy to reklamacja?",
            "Tak, jeżeli jest to wada ukryta i produkt jest w okresie gwarancji. "
            "Termin zgłoszenia to 14 dni od wykrycia wady. Wady jawne zgłasza się "
            "w ciągu 7 dni od dostawy. Źródło: procedura reklamacyjna P-07, "
            "rozdział 2.",
        ),
        (
            "W jakim czasie rozpatrujemy reklamację?",
            "14 dni kalendarzowych od zgłoszenia. Brak decyzji w tym terminie "
            "oznacza uznanie reklamacji. Naprawa lub wymiana następuje w ciągu "
            "21 dni od uznania. Źródło: procedura reklamacyjna P-07, rozdział 3.",
        ),
        (
            "Czy możemy obiecać dostawę wózka elektrycznego w dwa tygodnie?",
            "Nie. Czas dostawy WZE-20 wynosi 35 dni roboczych, a stan magazynowy "
            "tego modelu jest poniżej zapasu minimalnego. Przed złożeniem "
            "deklaracji sprawdź arkusz stanów magazynowych. Źródło: cennik 2026 "
            "i zestawienie stanów magazynowych.",
        ),
        (
            "Kiedy rusza magazyn w Gdańsku?",
            "1 czerwca 2026, zgodnie z uchwałą zarządu nr 2/2026. Do tego czasu "
            "klienci z Pomorza obsługiwani są z magazynu M1 w Poznaniu. Źródło: "
            "protokół posiedzenia zarządu nr 2/2026.",
        ),
        (
            "Od kiedy obowiązują nowe ceny?",
            f"Podwyżka cen katalogowych: {PRICE_INCREASE_2026}. Klienci z umowami "
            "ramowymi muszą otrzymać zawiadomienie 30 dni przed zmianą — listę "
            "prowadzi dział handlowy. Źródło: uchwała 3/2026 i § 3 umowy ramowej.",
        ),
        (
            "Jaka jest kara za opóźnioną dostawę?",
            "0,2% wartości netto opóźnionej dostawy za każdy dzień zwłoki, nie "
            "więcej niż 15% wartości zamówienia. Źródło: § 7 umowy ramowej.",
        ),
    ]

    for question, answer in questions:
        k.heading(document, question, 2)
        k.para(document, answer)

    k.heading(document, "Czego nie wolno obiecywać", 2)
    k.bullets(
        document,
        [
            "rabatu powyżej 15% bez pisemnej zgody dyrektora handlowego,",
            "terminu dostawy krótszego niż podany w cenniku,",
            "montażu w cenie produktu — montaż to 12% wartości netto regałów,",
            "wydłużenia gwarancji ponad okres z umowy ramowej,",
            "objęcia umową serwisową sprzętu innego producenta.",
        ],
    )

    k.footer_note(document, f"{COMPANY['name']} · FAQ handlowe · dokument demonstracyjny")
    document.save(path)
