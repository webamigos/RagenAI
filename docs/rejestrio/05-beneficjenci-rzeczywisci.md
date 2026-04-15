# Beneficjenci rzeczywiści | API | Rejestr.io

[![](https://rejestr.io/img/logo.svg)](/)

[Organizacje](https://rejestr.io/organizacje) [Zdarzenia](https://rejestr.io/zdarzenia) [Teczki](https://rejestr.io/teczki) [Branże](https://rejestr.io/branze) [Cennik](https://rejestr.io/cennik) [API](https://rejestr.io/api)

![Rozwiń menu konta](https://rejestr.io/img/account.svg)

1.  [Rejestr.io API](https://rejestr.io/api)

# [Dostępne żądania](https://rejestr.io/api)

[Wyszukiwanie organizacji](https://rejestr.io/api/info/wyszukiwanie-organizacji) [Podstawowe dane organizacji](https://rejestr.io/api/info/podstawowe-dane-organizacji) [Zaawansowane dane organizacji](https://rejestr.io/api/info/zaawansowane-dane-organizacji) [Dane osoby](https://rejestr.io/api/info/dane-osoby) [Beneficjenci rzeczywiści](https://rejestr.io/api/info/beneficjenci-rzeczywisci) [Powiązania organizacji](https://rejestr.io/api/info/powiazania-organizacji) [Powiązania osoby](https://rejestr.io/api/info/powiazania-osoby) [Odpis z KRS organizacji](https://rejestr.io/api/info/odpis-z-krs-organizacji) [Lista wpisów do KRS dla organizacji](https://rejestr.io/api/info/lista-wpisow-do-krs-dla-organizacji) [Lista dokumentów finansowych organizacji](https://rejestr.io/api/info/lista-dokumentow-finansowych-organizacji) [Dokument finansowy organizacji](https://rejestr.io/api/info/dokument-finansowy-organizacji) [Stan konta API](https://rejestr.io/api/info/stan-konta)

# Beneficjenci rzeczywiści

Zwraca listę osób będących beneficjentami rzeczywistymi dla organizacji.

GET https://rejestr.io/api/v2/org/{id}/crbr

Lista ta nie pochodzi z KRS a z Centralnego Rejestru Beneficjentów Rzeczywistych (CRBR).

Uwaga: dane z CRBR wymagają planu abonamentowego [Rejestr.io Premium](/cennik) lub wyższego.

## Obsługiwane parametry

`id`

string ^(\[0-9\]{1,10})|(nip\[0-9\]{10})$

Id organizacji: albo numer KRS (np. `12345` lub `0000012345`), albo NIP organizacji poprzedzony słowem "nip" (np. `nip1234567890`).

## Odpowiedź

Poprawna odpowiedź jest listą obiektów, z następującymi kluczami:

`id`

integer

Id osoby w systemie Rejestr.io. W przypadku osób bez nr PESEL, nie ma tego pola.

`kod_kraju_rezydencji`

string

Kod ISO 3166 kraju rezydencji osoby.

`kody_krajow_obywatelstwa`

array

Lista kodów ISO 3166 krajów obywatelstwa osoby.

`tozsamosc`

object

Dane o osobie.

Więcej informacji

Obiekt o następujących kluczach:

`data_urodzenia`

string

Data urodzin, w formacie RRRR-MM-DD.

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

`typ`

string

wartości: `osoba`, `osoba-bez-pesel`

Typ obiektu - albo `osoba` albo `osoba-bez-pesel`.
