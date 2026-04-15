# Powiązania organizacji | API | Rejestr.io

[![](https://rejestr.io/img/logo.svg)](/)

[Organizacje](https://rejestr.io/organizacje) [Zdarzenia](https://rejestr.io/zdarzenia) [Teczki](https://rejestr.io/teczki) [Branże](https://rejestr.io/branze) [Cennik](https://rejestr.io/cennik) [API](https://rejestr.io/api)

![Rozwiń menu konta](https://rejestr.io/img/account.svg)

1.  [Rejestr.io API](https://rejestr.io/api)

# [Dostępne żądania](https://rejestr.io/api)

[Wyszukiwanie organizacji](https://rejestr.io/api/info/wyszukiwanie-organizacji) [Podstawowe dane organizacji](https://rejestr.io/api/info/podstawowe-dane-organizacji) [Zaawansowane dane organizacji](https://rejestr.io/api/info/zaawansowane-dane-organizacji) [Dane osoby](https://rejestr.io/api/info/dane-osoby) [Beneficjenci rzeczywiści](https://rejestr.io/api/info/beneficjenci-rzeczywisci) [Powiązania organizacji](https://rejestr.io/api/info/powiazania-organizacji) [Powiązania osoby](https://rejestr.io/api/info/powiazania-osoby) [Odpis z KRS organizacji](https://rejestr.io/api/info/odpis-z-krs-organizacji) [Lista wpisów do KRS dla organizacji](https://rejestr.io/api/info/lista-wpisow-do-krs-dla-organizacji) [Lista dokumentów finansowych organizacji](https://rejestr.io/api/info/lista-dokumentow-finansowych-organizacji) [Dokument finansowy organizacji](https://rejestr.io/api/info/dokument-finansowy-organizacji) [Stan konta API](https://rejestr.io/api/info/stan-konta)

# Powiązania organizacji

Zwraca aktualne i/lub historyczne powiązania organizacji z innymi organizacjami lub osobami w KRS.

GET https://rejestr.io/api/v2/org/{id}/krs-powiazania

## Obsługiwane parametry GET

`id`

string ^(\[0-9\]{1,10})|(nip\[0-9\]{10})$

Id organizacji: albo numer KRS (np. `12345` lub `0000012345`), albo NIP organizacji poprzedzony słowem "nip" (np. `nip1234567890`).

`aktualnosc`

string

wartości: `aktualne`, `historyczne`

domyślnie: `aktualne`

Rodzaj powiązań jakie zostaną zwrócone:

Więcej informacji

- _aktualne_ - Powiązania aktualne, występujące w najnowszym wpisie do KRS.
- _historyczne_ - Powiązania historyczne, czyli takie, które istniały w przeszłości, ale nie występują w najnowszym wpisie do KRS.

Jeśli ten parametr nie jest podany, zwracane są powiązania aktualne.

**Uwaga:** powiązania historyczne wymagają planu [Rejestr.io Premium](https://rejestr.io/cennik) lub wyższego.

## Odpowiedź

Poprawna odpowiedź jest listą elementów, z których każdy może być:

- organizacją
- osobą posiadającą profil
- osobą nieposiadącją profilu

**Obiekt reprezentujący organizację, zawiera następujące klucze:**

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

`krs_powiazania_kwerendowane`

array

Lista powiązań tej organizacji do kwerendowanej organizacji / osoby.

`data_start`

string

Data początku powiązania, w formacie RRRR-MM-DD.

`data_koniec`

string

Data końca powiązania, w formacie RRRR-MM-DD - lub 'null' jeśli powiązanie trwa nadal.

`kierunek`

string

wartości: `AKTYWNY`, `PASYWNY`

Kierunek powiązania, najprościej wyjaśnialny na poniższym przykładzie.

Jeśli odpytujemy o powiązania organizacji A, i otrzymujemy w odpowiedzi organizację B, z typem powiązania "jedyny udziałowiec", to `kierunek` ma następujące znaczenie:

- `AKTYWNY`: organizacja B jest jedynym udziałowcem organizacji A (B posiada A);
- `PASYWNY`: organizacja B ma organizację A jako jedynego udziałowca (B jest posiadana przez A)

Uogólniając powyższe, `kierunek` ma następujące znaczenie:

- `AKTYWNY`: oznacza, że obiekt zwrócony w wynikach pełni rolę wskazaną w polu `typ` wobec odpytywanego obiektu;
- `PASYWNY`: oznacza, że odpytywany obiekt pełni rolę wskazaną w polu `typ` wobec obiektu zwróconego w wynikach.

Warto tutaj pamiętać, że choć odpytujemy o powiązania obiektu kwerendowanego, to w liście wyników powiązania te są przypisane poszczególnym obiektom na tej liście, i stąd `kierunek` jest `AKTYWNY` lub `PASYWNY` _z punktu widzenia obiektu na liście wyników_, a nie obiektu kwerendowanego.

`opis`

string

Szczegółowy opis typu powiązania.

`typ`

string

Typ powiązania, np. KRS_SHAREHOLDER, KRS_BOARD, itp.

**Obiekt reprezentujący osobę posiadającą profil, zawiera następujące klucze:**

`id`

integer

Id osoby.

`tozsamosc`

object

Dane o osobie.

Więcej informacji

Obiekt o następujących kluczach:

`data_urodzenia`

string

Data urodzin, w formacie RRRR-MM-DD.

Uwaga: aby ta dana została zwrócona, konieczne jest posiadanie abonamentu Rejestr.io Premium lub wyższego.

`drugie_imiona`

string

Imiona poza pierwszym.

`imie`

string

Pierwsze imię.

`imiona_i_nazwisko`

string

Wszystkie imiona i nazwisko.

`nazwisko`

string

`plec`

string

wartości: `F`, `M`

Płeć.

`krs_powiazania_liczby`

object

Liczby powiązań tej osoby z organizacjami w KRS, oraz liczby powiązanych organizacji.

Więcej informacji

Obiekt o następujących kluczach:

`aktualne`

integer

Liczba powiązań występujących aktualnie.

Uwaga: osoba może mieć więcej niż jedno powiązanie z daną organizacją, np. jako wspólnik oraz jako członek zarządu. Każde z nich jest tutaj liczone osobno.

`aktualne_organizacje`

integer

Liczba organizacji, z którymi ta osoba ma obecnie powiązania z KRS.

Może różnić się od liczby wszystkich aktualnych powiązań gdy pomiędzy tą osobą a co najmniej jedną organizacją występuje wiele powiązań różnych typów.

`przeszle`

integer

Liczba powiązań występujących w przeszłości a nie występujących aktualnie.

Uwaga: osoba może mieć więcej niż jedno powiązanie z daną organizacją, np. jako wspólnik oraz jako członek zarządu. Każde z nich jest tutaj liczone osobno.

`typ`

string

wartości: `osoba`

Typ obiektu, zawsze przybierający jedną wartość (osoba).

`krs_powiazania_kwerendowane`

array

Lista powiązań tej osoby do kwerendowanej organizacji.

`data_start`

string

Data początku powiązania, w formacie RRRR-MM-DD.

`data_koniec`

string

Data końca powiązania, w formacie RRRR-MM-DD - lub 'null' jeśli powiązanie trwa nadal.

`kierunek`

string

wartości: `AKTYWNY`, `PASYWNY`

Kierunek powiązania, najprościej wyjaśnialny na poniższym przykładzie.

Jeśli odpytujemy o powiązania organizacji A, i otrzymujemy w odpowiedzi organizację B, z typem powiązania "jedyny udziałowiec", to `kierunek` ma następujące znaczenie:

- `AKTYWNY`: organizacja B jest jedynym udziałowcem organizacji A (B posiada A);
- `PASYWNY`: organizacja B ma organizację A jako jedynego udziałowca (B jest posiadana przez A)

Uogólniając powyższe, `kierunek` ma następujące znaczenie:

- `AKTYWNY`: oznacza, że obiekt zwrócony w wynikach pełni rolę wskazaną w polu `typ` wobec odpytywanego obiektu;
- `PASYWNY`: oznacza, że odpytywany obiekt pełni rolę wskazaną w polu `typ` wobec obiektu zwróconego w wynikach.

Warto tutaj pamiętać, że choć odpytujemy o powiązania obiektu kwerendowanego, to w liście wyników powiązania te są przypisane poszczególnym obiektom na tej liście, i stąd `kierunek` jest `AKTYWNY` lub `PASYWNY` _z punktu widzenia obiektu na liście wyników_, a nie obiektu kwerendowanego.

`opis`

string

Szczegółowy opis typu powiązania.

`typ`

string

Typ powiązania, np. KRS_SHAREHOLDER, KRS_BOARD, itp.

**Obiekt reprezentujący osobę nieposiadającą profilu, zawiera następujące klucze:**

`id`

integer

Id osoby.

`tozsamosc`

object

Dane o osobie.

Więcej informacji

Obiekt o następujących kluczach:

`drugie_imiona`

string

Imiona poza pierwszym.

`imie`

string

Pierwsze imię.

`imiona_i_nazwisko`

string

Wszystkie imiona i nazwisko.

`nazwisko`

string

`typ`

string

wartości: `osoba-bez-pesel`

Typ obiektu, zawsze przybierający jedną wartość (osoba-bez-pesel).

`krs_powiazania_kwerendowane`

array

Lista powiązań tej osoby do kwerendowanej organizacji.

`data_start`

string

Data początku powiązania, w formacie RRRR-MM-DD.

`data_koniec`

string

Data końca powiązania, w formacie RRRR-MM-DD - lub 'null' jeśli powiązanie trwa nadal.

`kierunek`

string

wartości: `AKTYWNY`, `PASYWNY`

Kierunek powiązania, najprościej wyjaśnialny na poniższym przykładzie.

Jeśli odpytujemy o powiązania organizacji A, i otrzymujemy w odpowiedzi organizację B, z typem powiązania "jedyny udziałowiec", to `kierunek` ma następujące znaczenie:

- `AKTYWNY`: organizacja B jest jedynym udziałowcem organizacji A (B posiada A);
- `PASYWNY`: organizacja B ma organizację A jako jedynego udziałowca (B jest posiadana przez A)

Uogólniając powyższe, `kierunek` ma następujące znaczenie:

- `AKTYWNY`: oznacza, że obiekt zwrócony w wynikach pełni rolę wskazaną w polu `typ` wobec odpytywanego obiektu;
- `PASYWNY`: oznacza, że odpytywany obiekt pełni rolę wskazaną w polu `typ` wobec obiektu zwróconego w wynikach.

Warto tutaj pamiętać, że choć odpytujemy o powiązania obiektu kwerendowanego, to w liście wyników powiązania te są przypisane poszczególnym obiektom na tej liście, i stąd `kierunek` jest `AKTYWNY` lub `PASYWNY` _z punktu widzenia obiektu na liście wyników_, a nie obiektu kwerendowanego.

`opis`

string

Szczegółowy opis typu powiązania.

`typ`

string

Typ powiązania, np. KRS_SHAREHOLDER, KRS_BOARD, itp.
