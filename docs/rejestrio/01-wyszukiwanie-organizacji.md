# Wyszukiwanie organizacji | API | Rejestr.io

[![](https://rejestr.io/img/logo.svg)](/)

[Organizacje](https://rejestr.io/organizacje) [Zdarzenia](https://rejestr.io/zdarzenia) [Teczki](https://rejestr.io/teczki) [Branże](https://rejestr.io/branze) [Cennik](https://rejestr.io/cennik) [API](https://rejestr.io/api)

![Rozwiń menu konta](https://rejestr.io/img/account.svg)

1.  [Rejestr.io API](https://rejestr.io/api)

# [Dostępne żądania](https://rejestr.io/api)

[Wyszukiwanie organizacji](https://rejestr.io/api/info/wyszukiwanie-organizacji) [Podstawowe dane organizacji](https://rejestr.io/api/info/podstawowe-dane-organizacji) [Zaawansowane dane organizacji](https://rejestr.io/api/info/zaawansowane-dane-organizacji) [Dane osoby](https://rejestr.io/api/info/dane-osoby) [Beneficjenci rzeczywiści](https://rejestr.io/api/info/beneficjenci-rzeczywisci) [Powiązania organizacji](https://rejestr.io/api/info/powiazania-organizacji) [Powiązania osoby](https://rejestr.io/api/info/powiazania-osoby) [Odpis z KRS organizacji](https://rejestr.io/api/info/odpis-z-krs-organizacji) [Lista wpisów do KRS dla organizacji](https://rejestr.io/api/info/lista-wpisow-do-krs-dla-organizacji) [Lista dokumentów finansowych organizacji](https://rejestr.io/api/info/lista-dokumentow-finansowych-organizacji) [Dokument finansowy organizacji](https://rejestr.io/api/info/dokument-finansowy-organizacji) [Stan konta API](https://rejestr.io/api/info/stan-konta)

# Wyszukiwanie organizacji

Zwraca listę organizacji na podstawie zadanych kryteriów.

GET https://rejestr.io/api/v2/org

**Uwaga:** Jeśli znasz numer KRS organizacji - nie musisz jej wyszukiwać. W takim wypadku, skorzystaj od razu z [pobierania podstawowych danych organizacji](/api/zadania/pobieranie-podstawowych-danych-organizacji).

## Kryteria wyszukiwania

Możesz wyszukiwać organizacje korzystając z następujących parametrów GET:

`nazwa`

string

Fragment nazwy organizacji.

Więcej informacji

Znaki specjalne powinny być zakodowane używając kodowania procentowego (https://en.wikipedia.org/wiki/Percent-encoding). W szczególności znak spacji koduje się przez **%20**. Przykładowo:

- wyszukiwanie **examplex polska** powinno być zakodowane w URL jako **nazwa=examplex%20polska**.

Wielkość liter nie ma znaczenia. Następujące wyszukiwania są równoważne: **Examplex Polska** i **examplex polska**.

Zadany fragment nazwy musi zawierać pełne słowa. Przykładowo:

- wyszukiwanie **examplex** zwróci np. **Examplex Polska**,
- wyszukiwanie **polska examplex** także zwróci **Examplex Polska**,
- wyszukiwanie **examplex pol** NIE zwróci **Examplex Polska**.

Nazwy organizacji zawierają formę prawną w wersji rozwiniętej, czyli np. 'Examplex Polska spółka z ograniczoną odpowiedzialnością' a nie 'Examplex Polska sp. z o.o.'. Zatem szukanie używając skrótów nie zwróci wyników.

`nip`

string

Pełen numer NIP organizacji, bez myślników.

`regon`

string

Pełen numer REGON organizacji.

`forma_prawna`

string

Pełna forma prawna organizacji, pisana wielkimi literami.

Więcej informacji

**Uwaga:** Znak spacji koduje się w URL przez **%20**.

`wpis_pierwszy_data`

string

Data pierwszego wpisu do KRS.

Więcej informacji

Wartością tego parametru jest ciąg znaków reprezentujący albo konkretną datę albo okres czasu. W tym celu występują następujące operatory:

- `lt` - mniejsza niż
- `lte` - mniejsza niż lub równa
- `eq` - równa
- `gte` - większa niż lub równa
- `gt` - większa niż

Używając powyższych operatorów, same daty zawsze podaje się w formacie `RRRR-MM-DD`, czyli np. `2010-07-15` dla 15 lipca 2010 r.

W celu zapytania o konkretną datę należy wpisać ją wraz z operatorem `eq`. Np. zapytanie o organizacje z datą pierwszego wpisu do KRS w dn. 15 lipca 2010 r. wygląda następująco: `wpis_pierwszy_data=eq:2010-07-15`.

W celu zapytania o okres czasu należy użyć pozostałych operatorów. Można po przecinku użyć dwóch operatorów, aby uzyskać okres ograniczony z obu stron.

Np. zapytanie o organizacje z datą pierwszego wpisu do KRS nie wcześniej niż 15 lipca 2010 r. i jednocześnie wcześniej niż 15 sierpnia 2020 r. wygląda następująco: `wpis_pierwszy_data=gte:2010-07-15,lt:2020-08-15`.

`wpis_najnowszy_data`

string

Data najnowszego wpisu do KRS.

Więcej informacji

Wartością tego parametru jest ciąg znaków reprezentujący albo konkretną datę albo okres czasu. W tym celu występują następujące operatory:

- `lt` - mniejsza niż
- `lte` - mniejsza niż lub równa
- `eq` - równa
- `gte` - większa niż lub równa
- `gt` - większa niż

Używając powyższych operatorów, same daty zawsze podaje się w formacie `RRRR-MM-DD`, czyli np. `2010-07-15` dla 15 lipca 2010 r.

W celu zapytania o konkretną datę należy wpisać ją wraz z operatorem `eq`. Np. zapytanie o organizacje z datą najnowszego wpisu do KRS w dn. 15 lipca 2010 r. wygląda następująco: `wpis_najnowszy_data=eq:2010-07-15`.

W celu zapytania o okres czasu należy użyć pozostałych operatorów. Można po przecinku użyć dwóch operatorów, aby uzyskać okres ograniczony z obu stron.

Np. zapytanie o organizacje z datą najnowszego wpisu do KRS nie wcześniej niż 15 lipca 2010 r. i jednocześnie wcześniej niż 15 sierpnia 2020 r. wygląda następująco: `wpis_najnowszy_data=gte:2010-07-15,lt:2020-08-15`.

`przewazajacy_pkd`

string

Kod PKD przeważającej działalności przedsiębiorcy.

Więcej informacji

Można także szukać po przedrostku kodu. Np. podające wartość **24** otrzyma się zarówno organizacje mające kod PKD przeważającej działalności równy **24.51.Z** jak i **24.52.Z**, itd.

**Uwaga:** Istnieją organizacje, które nadal nie poprawiły swoich kodów PKD po zmianie numeracji w 2007 r.

`pozostaly_pkd`

string

Kod PKD pozostałej działalności przedsiębiorcy.

Więcej informacji

Można także szukać po przedrostku kodu. Np. podające wartość **24** otrzyma się zarówno organizacje mające kod PKD pozostałej działalności równy **24.51.Z** jak i **24.52.Z**, itd.

**Uwaga:** Istnieją organizacje, które nadal nie poprawiły swoich kodów PKD po zmianie numeracji w 2007 r.

`dowolny_pkd`

string

Kod PKD przeważającej lub pozostałej działalności przedsiębiorcy.

Więcej informacji

Można także szukać po przedrostku kodu. Np. podające wartość **24** otrzyma się zarówno organizacje mające dowolny kod PKD równy **24.51.Z** jak i **24.52.Z**, itd.

**Uwaga:** Istnieją organizacje, które nadal nie poprawiły swoich kodów PKD po zmianie numeracji w 2007 r.

`czy_pozytku_publicznego`

boolean

Czy organizacja jest organizacją pożytku publicznego (OPP)?

`czy_wykreslona`

boolean

Czy organizacja jest wykreślona z KRS?

`czy_w_likwidacji`

boolean

Czy organizacja jest w likwidacji?

`czy_w_upadlosci`

boolean

Czy organizacja jest w upadłości?

`czy_w_zawieszeniu`

boolean

Czy organizacja jest w zawieszeniu?

`kapital`

string

Wysokość kapitału zakładowego.

Więcej informacji

Wartością tego parametru jest ciąg znaków reprezentujący albo konkretną wartość kapitału albo jakiś jego zakres. W tym celu występują następujące operatory:

- `lt` - mniejszy niż
- `lte` - mniejszy niż lub równy
- `eq` - równy
- `gte` - większy niż lub równy
- `gt` - większy niż

W celu zapytania o konkretną wartość należy wpisać tę wartość wraz z operatorem `eq`. Np. zapytanie o organizacje z kapitałem 10000 zł wygląda następująco: `kapital=eq:10000`.

W celu zapytania o zakres kapitału należy użyć pozostałych operatorów. Można po przecinku użyć dwóch operatorów, aby uzyskać zakres ograniczony z obu stron.

Np. zapytanie o organizacje z kapitałem równym co najmniej 10000 zł ale mniej niż 15000 zł wygląda następująco: `kapital=gte:10000,lt:15000`.

**Uwaga**: nieznaczna liczba organizacji (mniej niż 100), podaje kapitał zakładowy w euro, zamiast w złotówkach.

`wielkosc`

string

wartości: `duza_srednia`, `mala`, `mikro`, `ngo`

Wielkość organizacji wg klasyfikacji z ustawy o rachunkowości.

Więcej informacji

**Uwagi:**

- **Niepełne pokrycie:** Filtr nie obejmuje organizacji, które nie złożyły jeszcze żadnego sprawozdania finansowego możliwego do automatycznego przetworzenia.
- **Wymagany plan:** Ten filtr wymaga planu abonamentowego [Rejestr.io Biznes](https://rejestr.io/cennik).

`typ_adresu`

string

wartości: `dowolny`, `organizacja`, `oddzial`

domyślnie: `dowolny`

Czy ograniczyć wyszukiwanie wg kryteriów adresowych (np. "panstwo", "terc_powiat", itp.) tylko do adresu organizacji lub tylko do adresów oddziałów.

`panstwo`

string

Państwo w adresie organizacji lub jej oddziału.

Więcej informacji

Uwaga: ten parametr wyszukiwania operuje na adresach podanych w KRS, zaś nie operuje na polu "siedziba", określanym w KRS z dokładnością do gminy (bez np. ulicy) i wykorzystywanym np. do ustalania właściwości sądu.

`miejscowosc`

string

Miejscowosc w adresie organizacji lub jej oddziału.

Więcej informacji

Uwaga: ten parametr wyszukiwania operuje na adresach podanych w KRS, zaś nie operuje na polu "siedziba", określanym w KRS z dokładnością do gminy (bez np. ulicy) i wykorzystywanym np. do ustalania właściwości sądu.

`kod_pocztowy`

string

Kod pocztowy w adresie organizacji lub jej oddziału.

Więcej informacji

Uwaga: ten parametr wyszukiwania operuje na adresach podanych w KRS, zaś nie operuje na polu "siedziba", określanym w KRS z dokładnością do gminy (bez np. ulicy) i wykorzystywanym np. do ustalania właściwości sądu.

`ulica`

string

Ulica w adresie organizacji lub jej oddziału.

Więcej informacji

Uwaga: ten parametr wyszukiwania operuje na adresach podanych w KRS, zaś nie operuje na polu "siedziba", określanym w KRS z dokładnością do gminy (bez np. ulicy) i wykorzystywanym np. do ustalania właściwości sądu.

`nr_domu`

string

Numer domu w adresie organizacji lub jej oddziału.

Więcej informacji

Uwaga: ten parametr wyszukiwania operuje na adresach podanych w KRS, zaś nie operuje na polu "siedziba", określanym w KRS z dokładnością do gminy (bez np. ulicy) i wykorzystywanym np. do ustalania właściwości sądu.

`terc_wojewodztwo`

string

Dwucyfrowy kod TERC województwa zawierającego adres organizacji lub jej oddziału.

Więcej informacji

Rejestr TERYT, ustalający kody TERC: [https://eteryt.stat.gov.pl](%5Bhttps://eteryt.stat.gov.pl).

Uwaga: ten parametr wyszukiwania operuje na adresach podanych w KRS, zaś nie operuje na polu "siedziba", określanym w KRS z dokładnością do gminy (bez np. ulicy) i wykorzystywanym np. do ustalania właściwości sądu.

`terc_powiat`

string

Czterocyfrowy kod TERC powiatu zawierającego adres organizacji lub jej oddziału.

Więcej informacji

Rejestr TERYT, ustalający kody TERC: [https://eteryt.stat.gov.pl](%5Bhttps://eteryt.stat.gov.pl).

Uwaga: ten parametr wyszukiwania operuje na adresach podanych w KRS, zaś nie operuje na polu "siedziba", określanym w KRS z dokładnością do gminy (bez np. ulicy) i wykorzystywanym np. do ustalania właściwości sądu.

`terc_gmina`

string

**Sześciocyfrowy** (NIE siedmiocyfrowy) kod TERC gminy zawierającej adres organizacji lub jej oddziału.

Więcej informacji

Rejestr TERYT, ustalający kody TERC: [https://eteryt.stat.gov.pl](%5Bhttps://eteryt.stat.gov.pl).

Uwaga: ten parametr wyszukiwania operuje na adresach podanych w KRS, zaś nie operuje na polu "siedziba", określanym w KRS z dokładnością do gminy (bez np. ulicy) i wykorzystywanym np. do ustalania właściwości sądu.

## Sortowanie

Aby dostosować kolejność organizacji na liście wyników, użyj parametru GET:

`sortowanie`

string

Określenie porządku sortowania wyników wyszukiwania.

Więcej informacji

Wartością tego parametru jest ciąg znaków reprezentujący pole, po którym należy posortować wyniki, oraz opcjonalnie kierunek sortowania (`malejaco` albo `rosnaco`).

Przykład parametru: `sortowanie=wpis_pierwszy_data:rosnaco`. Takie wyszukiwanie zwróci wyniki posortowane po dacie pierwszego wpisu do KRS w kolejności rosnącej, czyli od najstarszych do najmłodszych organizacji.

Pola, które można podać jako kryterium sortowania (lista będzie poszerzana):

- `kapital`
- `nazwa`
- `wpis_najnowszy_data`
- `wpis_pierwszy_data`

Przy polach poza `nazwa` można używać kierunków sortowania: `malejaco` lub `rosnaco`, z których pierwszy jest domyślny.

Dla pola `nazwa`, kierunek sortowania jest zawsze malejący, zgodnie z dopasowaniem szukanego tekstu do nazwy organizacji, lekko zmodyfikowanym wg kapitału zakładowego, gdzie większy kapitał oznacza wyższy wynik.

Przykłady parametru:

- `sortowanie=wpis_pierwszy_data:rosnaco`
- `sortowanie=kapital:malejaco`
- `sortowanie=nazwa`

Zwracane organizacje są posortowane w następujący sposób:

- jeśli używany jest parametr `sortowanie` - zgodnie z jego definicją;
- jeśli parametr `sortowanie` nie jest używany, ale jest używany parametr `nazwa` - zgodnie z dopasowaniem szukanego tekstu do nazwy organizacji, lekko zmodyfikowanym wg kapitału zakładowego, gdzie większy kapitał oznacza wyższy wynik;
- w przeciwnym wypadku - po numerze KRS, malejąco.

## Stronnicowanie

Wyniki wyszukiwania są dzielone na strony, zgodnie z następującymi parametrami GET:

`strona`

integer int64

domyślnie: `1`

Którą stronę wyników wyszukiwania zwrócić.

`ile_na_strone`

integer int64

domyślnie: `10`

Ile maksymalnie organizacji mieści się na stronie wyników wyszukiwania.

## Odpowiedź

Poprawna odpowiedź jest obiektem o następujących kluczach:

`liczba_wszystkich_wynikow`

integer

Liczba wszystkich znalezionych organizacji, często większa niż liczba wyświetlanych na obecnej stronie.

`wyniki`

array

Lista organizacji dla obecnej strony.

Lista obiektów o następujących kluczach:

`id`

integer

Id organizacji. Jest to nr KRS bez początkowych zer.

`nazwy`

object

Różne warianty nazwy organizacji.

Więcej informacji

Obiekt o następujących kluczach:

`pelna`

string

Pełna nazwa organizacji, np. "EXAMPLEX POLSKA SPÓŁKA AKCYJNA".

`skrocona`

string

Skrócona nazwa organizacji, np. "EXAMPLEX POLSKA".

`numery`

object

Numery rejestrowe organizacji.

Więcej informacji

Obiekt o następujących kluczach:

`duns`

integer

Nr DUNS organizacji.

Uwaga: to pole nie pochodzi z KRS. Brak tej danej oznacza, że nasze źródło jej nie posiada, choć jest możliwe, że organizacja w rzeczywistości ma przypisany ten numer.

`krs`

integer

Pełen nr KRS organizacji.

`nip`

integer

Nr NIP organizacji.

`regon`

integer

Nr REGON organizacji.

`stan`

object

Kluczowe dane o stanie organizacji.

Więcej informacji

Obiekt o następujących kluczach:

`czy_dofinansowana_przez_ue`

boolean

Czy organizacja otrzymała dofinansowanie z Unii Europejskiej?

`czy_jest_na_gwp`

boolean

Czy organizacja jest na Giełdzie Papierów Wartościowych w Warszawie?

`czy_otrzymala_pomoc_publiczna`

boolean

Czy organizacja otrzymała pomoc publiczną?

`czy_pozytku_publicznego`

boolean

Czy organizacja jest organizacją pożytku publicznego (OPP)?

`czy_spolka_skarbu_panstwa`

boolean

Czy organizacja jest spółką Skarbu Państwa?

`czy_wykreslona`

boolean

Czy organizacja została wykreślona z KRS?

`forma_prawna`

string

Forma prawna organizacji.

`pkd_przewazajace_dzial`

string

Słowny opis działu przeważającego PKD organizacji.

`w_likwidacji`

boolean

Czy organizacja jest w likwidacji?

`w_upadlosci`

boolean

Czy organizacja jest w upadłości?

`w_zawieszeniu`

boolean

Czy organizacja jest w zawieszeniu?

`wielkosc`

string

wartości: `duza_srednia`, `mala`, `mikro`, `ngo`

Wielkość organizacji wg klasyfikacji z ustawy o rachunkowości.

Uwaga: Dla organizacji, które nie złożyły jeszcze żadnego sprawozdania finansowego możliwego do automatycznego przetworzenia, wartość ta nie jest ustalana.

`glowna_osoba`

object

Osoba stojąca na czele organizacji: prezes zarządu, przewodniczący, itp.

Więcej informacji

Obiekt o następujących kluczach:

`id`

integer

Id osoby, które może być użyte np. w zapytaniu ["Pobieranie danych osoby"](#operation/getPersonData).

`imiona_i_nazwisko`

string

`adres`

object

Główny adres organizacji wg KRS

Więcej informacji

Obiekt o następujących kluczach:

`kod`

string

Kod pocztowy

`miejscowosc`

string

`nr_domu`

string

`nr_mieszkania`

string

`panstwo`

string

`poczta`

string

`ulica`

string

`kontakt`

object

Dane kontaktowe organizacji, pochodzące zarówno z KRS jak i spoza KRS. Wymagają planu Rejestr.io Biznes.

Więcej informacji

Obiekt o następujących kluczach:

`emaile`

array

Lista adresów email organizacji.

`www`

string

Strona internetowa organizacji.

`ostatnie_sprawozdanie`

object

Dane z ostatniego złożonego sprawozdania finansowego takie jak: wysokość przychodów, kosztów, zysku lub stan aktywów i pasywów. Wymagają planu Rejestr.io Biznes.

Więcej informacji

Obiekt o następujących kluczach:

`id`

integer

Id sprawozdania

`data_od`

string

Data początkowa okresu objętego sprawozdaniem.

`data_do`

string

Data końcowa okresu objętego sprawozdaniem.

`rocznik`

integer

Jeśli okres objęty sprawozdaniem zaczyna się 1 stycznia i kończy 31 grudnia tego samego roku, to pole to przyjmuje wartość tego roku. Jeśli daty nie są tak "równe", to pole nie ma wartości.

`rocznik_przyblizony`

integer

Jeśli pole `rocznik` jest nieobecne, ponieważ daty początkowe i końcowe nie są "równe", to pole to przyjmuje wartość roku kalendarzowego, w którym znajduje się większa część okresu objętego sprawozdaniem.

`glowne_pola`

object

Główne dane finansowe organizacji zawarte w sprawozdaniu.

Więcej informacji

Obiekt o następujących kluczach:

`aktywa`

object

Aktywa

Więcej informacji

Obiekt o następujących kluczach:

`wartosc`

float

Wartość wyrażona w złotówkach.

`pasywa`

object

Pasywa

Więcej informacji

Obiekt o następujących kluczach:

`wartosc`

float

Wartość wyrażona w złotówkach.

`przychody`

object

Przychody

Więcej informacji

Obiekt o następujących kluczach:

`wartosc`

float

Wartość wyrażona w złotówkach.

`koszty`

object

Koszty

Więcej informacji

Obiekt o następujących kluczach:

`wartosc`

float

Wartość wyrażona w złotówkach.

`zysk`

object

Zysk

Więcej informacji

Obiekt o następujących kluczach:

`wartosc`

float

Wartość wyrażona w złotówkach.

`podatek_dochodowy`

object

Podatek dochodowy

Więcej informacji

Obiekt o następujących kluczach:

`wartosc`

float

Wartość wyrażona w złotówkach.

`krs_rejestry`

object

Informacje dotyczące wpisania i wykreślenia z rejestrów przedsiębiorców i stowarzyszeń w KRS.

Więcej informacji

Obiekt o następujących kluczach:

`rejestr_przedsiebiorcow_data_wpisu`

string

Data wpisania do rejestru przedsiębiorców w KRS w formacie RRRR-MM-DD.

Brak tej danej oznacza, że podmiot nigdy nie figurował w tym rejestrze. Natomiast w przypadku jej obecności, w celu ustalenia obecnego stanu podmiotu, należy również sprawdzić `rejestr_przedsiebiorcow_data_wykreslenia`.

`rejestr_przedsiebiorcow_data_wykreslenia`

string

Data wykreślenia z rejestru przedsiębiorców w KRS w formacie RRRR-MM-DD.

Brak tej danej oznacza:

- jeśli jest obecne `rejestr_przedsiebiorcow_data_wpisu`: że podmiot jest aktualnie w tym rejestrze,
- jeśli nie jest obecne `rejestr_przedsiebiorcow_data_wpisu`: że podmiot nigdy nie figurował w tym rejestrze.

`rejestr_stowarzyszen_data_wpisu`

string

Data wpisania do rejestru stowarzyszeń w KRS w formacie RRRR-MM-DD.

Brak tej danej oznacza, że podmiot nigdy nie figurował w tym rejestrze. Natomiast w przypadku jej obecności, w celu ustalenia obecnego stanu podmiotu, należy również sprawdzić `rejestr_stowarzyszen_data_wykreslenia`.

`rejestr_stowarzyszen_data_wykreslenia`

string

Data wykreślenia z rejestru stowarzyszeń w KRS w formacie RRRR-MM-DD.

Brak tej danej oznacza:

- jeśli jest obecne `rejestr_stowarzyszen_data_wpisu`: że podmiot jest aktualnie w tym rejestrze,
- jeśli nie jest obecne `rejestr_stowarzyszen_data_wpisu`: że podmiot nigdy nie figurował w tym rejestrze.

`krs_wpisy`

object

Informacje dotyczące kluczowych wpisów do KRS.

Więcej informacji

Obiekt o następujących kluczach:

`najnowszy_data`

string

Data najnowszego wpisu do KRS w formacie RRRR-MM-DD.

W przypadku organizacji wykreślonych z KRS, jest to również data wykreślenia.

`najnowszy_numer`

integer

Numer najnowszego wpisu do KRS.

`najnowszy_przed_wykresleniem_data`

string

W przypadku organizacji wykreślonych, data najnowszego wpisu do KRS zawierającego dane sprzed wykreślenia w formacie RRRR-MM-DD.

`najnowszy_przed_wykresleniem_numer`

string

W przypadku organizacji wykreślonych, numer najnowszego wpisu do KRS zawierającego dane sprzed wykreślenia.

`pierwszy_data`

string

Data pierwszego wpisu do KRS w formacie RRRR-MM-DD.

`wykreslenie_uprawomocnienie_data`

string

W przypadku organizacji wykreślonych, data uprawomocnienia się postanowienia sądu w kwestii wykreślenia organizacji z KRS, w formacie RRRR-MM-DD.

`krs_powiazania_liczby`

object

Liczby powiązań tej organizacji z innymi organizacjami i osobami w KRS.

Więcej informacji

Obiekt o następujących kluczach:

`aktualne`

integer

Liczba powiązań występujących aktualnie.

`przeszle`

integer

Liczba powiązań występujących w przeszłości a nie występujących aktualnie.

`metadane`

object

Date dotyczące wewnętrznego stanu organizacji w systemie informatycznym portalu Rejestr.io.

Więcej informacji

Obiekt o następujących kluczach:

`krs_odpis_synchronizacja_data_czas`

string

Data i czas ostatniej synchronizacji danych organizacji z oficjalnym KRS, w formacie RRRR-MM-DD GG:mm:SS, gdzie GG oznacza godzinę, mm minutę, a SS sekundę.

`krs_rozdzialy_dostepne`

array

Lista dostępnych rozdziałów KRS, o które można pytać w zapytaniu ["Pobieranie rozdziałów KRS organizacji"](#operation/getOrgKrsChapterData).

`typ`

string

wartości: `organizacja`

Typ obiektu API, zawsze przybierający jedną wartość (organizacja).
