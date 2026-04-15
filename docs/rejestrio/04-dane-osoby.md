# Dane osoby | API | Rejestr.io

[![](https://rejestr.io/img/logo.svg)](/)

[Organizacje](https://rejestr.io/organizacje) [Zdarzenia](https://rejestr.io/zdarzenia) [Teczki](https://rejestr.io/teczki) [Branże](https://rejestr.io/branze) [Cennik](https://rejestr.io/cennik) [API](https://rejestr.io/api)

![Rozwiń menu konta](https://rejestr.io/img/account.svg)

1.  [Rejestr.io API](https://rejestr.io/api)

# [Dostępne żądania](https://rejestr.io/api)

[Wyszukiwanie organizacji](https://rejestr.io/api/info/wyszukiwanie-organizacji) [Podstawowe dane organizacji](https://rejestr.io/api/info/podstawowe-dane-organizacji) [Zaawansowane dane organizacji](https://rejestr.io/api/info/zaawansowane-dane-organizacji) [Dane osoby](https://rejestr.io/api/info/dane-osoby) [Beneficjenci rzeczywiści](https://rejestr.io/api/info/beneficjenci-rzeczywisci) [Powiązania organizacji](https://rejestr.io/api/info/powiazania-organizacji) [Powiązania osoby](https://rejestr.io/api/info/powiazania-osoby) [Odpis z KRS organizacji](https://rejestr.io/api/info/odpis-z-krs-organizacji) [Lista wpisów do KRS dla organizacji](https://rejestr.io/api/info/lista-wpisow-do-krs-dla-organizacji) [Lista dokumentów finansowych organizacji](https://rejestr.io/api/info/lista-dokumentow-finansowych-organizacji) [Dokument finansowy organizacji](https://rejestr.io/api/info/dokument-finansowy-organizacji) [Stan konta API](https://rejestr.io/api/info/stan-konta)

# Dane osoby

Zwraca aktualne dane o osobie występującej w KRS.

GET https://rejestr.io/api/v2/osoby/{id}

## Obsługiwane parametry GET

`id`

integer int64

Id osoby

## Odpowiedź

Poprawna odpowiedź jest obiektem o następujących kluczach:

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
