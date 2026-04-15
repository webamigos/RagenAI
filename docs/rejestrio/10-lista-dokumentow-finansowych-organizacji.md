# Lista dokumentów finansowych organizacji | API | Rejestr.io

[![](https://rejestr.io/img/logo.svg)](/)

[Organizacje](https://rejestr.io/organizacje) [Zdarzenia](https://rejestr.io/zdarzenia) [Teczki](https://rejestr.io/teczki) [Branże](https://rejestr.io/branze) [Cennik](https://rejestr.io/cennik) [API](https://rejestr.io/api)

![Rozwiń menu konta](https://rejestr.io/img/account.svg)

1.  [Rejestr.io API](https://rejestr.io/api)

# [Dostępne żądania](https://rejestr.io/api)

[Wyszukiwanie organizacji](https://rejestr.io/api/info/wyszukiwanie-organizacji) [Podstawowe dane organizacji](https://rejestr.io/api/info/podstawowe-dane-organizacji) [Zaawansowane dane organizacji](https://rejestr.io/api/info/zaawansowane-dane-organizacji) [Dane osoby](https://rejestr.io/api/info/dane-osoby) [Beneficjenci rzeczywiści](https://rejestr.io/api/info/beneficjenci-rzeczywisci) [Powiązania organizacji](https://rejestr.io/api/info/powiazania-organizacji) [Powiązania osoby](https://rejestr.io/api/info/powiazania-osoby) [Odpis z KRS organizacji](https://rejestr.io/api/info/odpis-z-krs-organizacji) [Lista wpisów do KRS dla organizacji](https://rejestr.io/api/info/lista-wpisow-do-krs-dla-organizacji) [Lista dokumentów finansowych organizacji](https://rejestr.io/api/info/lista-dokumentow-finansowych-organizacji) [Dokument finansowy organizacji](https://rejestr.io/api/info/dokument-finansowy-organizacji) [Stan konta API](https://rejestr.io/api/info/stan-konta)

# Lista dokumentów finansowych organizacji

Pobieranie listy dokumentów finansowych w KRS dla organizacji.

GET https://rejestr.io/api/v2/org/{id}/krs-dokumenty

Uwaga: to żądanie API wymaga planu abonamentowego [Rejestr.io Premium](/cennik) lub wyższego.

## Obsługiwane parametry GET

`id`

string ^(\[0-9\]{1,10})|(nip\[0-9\]{10})$

Id organizacji: albo numer KRS (np. `12345` lub `0000012345`), albo NIP organizacji poprzedzony słowem "nip" (np. `nip1234567890`).

## Odpowiedź

Poprawna odpowiedź jest tablicą obiektów o następujących kluczach:

`data_start`

string

Data początkowa okresu rozliczeniowego, którego dotyczą wszystkie zawarte w tym zbiorze dokumenty.

`data_koniec`

string

Data końcowa okresu rozliczeniowego, którego dotyczą wszystkie zawarte w tym zbiorze dokumenty.

Uwaga: ta data jest włączna, czyli zalicza się do tego okresu rozliczeniowego.

`dokumenty`

array

Lista dokumentów finansowych w tym zbiorze.

Lista obiektów o następujących kluczach:

`czy_ma_json`

boolean

Czy dokument może być pobrany w formacie JSON (poza zawsze dostępnym formatem PDF).

`id`

integer

Id dokumentu, do użycia w zapytaniu ["Pobierz dokument finansowy KRS organizacji"](#operation/getOrgKrsFinStatement).

`nazwa`

string

Nazwa dokumentu, np. "bilans", "rachunek zysków i strat", itp.
