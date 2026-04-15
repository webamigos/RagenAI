# Zaawansowane dane organizacji | API | Rejestr.io

[![](https://rejestr.io/img/logo.svg)](/)

[Organizacje](https://rejestr.io/organizacje) [Zdarzenia](https://rejestr.io/zdarzenia) [Teczki](https://rejestr.io/teczki) [Branże](https://rejestr.io/branze) [Cennik](https://rejestr.io/cennik) [API](https://rejestr.io/api)

![Rozwiń menu konta](https://rejestr.io/img/account.svg)

1.  [Rejestr.io API](https://rejestr.io/api)

# [Dostępne żądania](https://rejestr.io/api)

[Wyszukiwanie organizacji](https://rejestr.io/api/info/wyszukiwanie-organizacji) [Podstawowe dane organizacji](https://rejestr.io/api/info/podstawowe-dane-organizacji) [Zaawansowane dane organizacji](https://rejestr.io/api/info/zaawansowane-dane-organizacji) [Dane osoby](https://rejestr.io/api/info/dane-osoby) [Beneficjenci rzeczywiści](https://rejestr.io/api/info/beneficjenci-rzeczywisci) [Powiązania organizacji](https://rejestr.io/api/info/powiazania-organizacji) [Powiązania osoby](https://rejestr.io/api/info/powiazania-osoby) [Odpis z KRS organizacji](https://rejestr.io/api/info/odpis-z-krs-organizacji) [Lista wpisów do KRS dla organizacji](https://rejestr.io/api/info/lista-wpisow-do-krs-dla-organizacji) [Lista dokumentów finansowych organizacji](https://rejestr.io/api/info/lista-dokumentow-finansowych-organizacji) [Dokument finansowy organizacji](https://rejestr.io/api/info/dokument-finansowy-organizacji) [Stan konta API](https://rejestr.io/api/info/stan-konta)

# Zaawansowane dane organizacji

Zwraca dane z podanego rozdziału KRS dla organizacji do podanym id (numerze KRS lub NIP).

GET https://rejestr.io/api/v2/org/{id}/krs-rozdzialy/{rozdzial}

Uwaga: rozdziały `oddzialy`, `zobowiazania` i `przeksztalcenia` wymagają planu [Rejestr.io Premium](/cennik) lub wyższego.

## Obsługiwane parametry GET

`id`

string ^(\[0-9\]{1,10})|(nip\[0-9\]{10})$

Id organizacji: albo numer KRS (np. `12345` lub `0000012345`), albo NIP organizacji poprzedzony słowem "nip" (np. `nip1234567890`).

`nr_wpisu`

integer int64

Numer wpisu do KRS, według którego zwracane są dane rozdziału.

Więcej informacji

Zwracane pola mają wartości ze stanu organizacji po dokonaniu wpisu do KRS o numerze takim jaka jest wartość niniejszego parametru.

**Uwaga:** użycie tego parametru wymaga planu [Rejestr.io Premium](https://rejestr.io/cennik) lub wyższego.

`rozdzial`

string ^(ogolny|oddzialy|akcje|wzmianki|zobowiazania|przeksztalcenia)$

Jeden z sześciu dostępnych rozdziałów KRS:

Więcej informacji

- `ogolny`
- `oddzialy`
- `akcje`
- `wzmianki`
- `zobowiazania`
- `przeksztalcenia`.

## Odpowiedź

Poprawna odpowiedź jest obiektem o kluczach odpowiadającym polom dostępnym dla wybranego rozdziału.

- [Pola dostępne w rozdziale 'ogolny'](#pola-dostepne-w-rozdziale-ogolny)
- [Pola dostępne w rozdziale 'oddzialy'](#pola-dostepne-w-rozdziale-oddzialy)
- [Pola dostępne w rozdziale 'akcje'](#pola-dostepne-w-rozdziale-akcje)
- [Pola dostępne w rozdziale 'wzmianki'](#pola-dostepne-w-rozdziale-wzmianki)
- [Pola dostępne w rozdziale 'zobowiazania'](#pola-dostepne-w-rozdziale-zobowiazania)
- [Pola dostępne w rozdziale 'przeksztalcenia'](#pola-dostepne-w-rozdziale-przeksztalcenia)

## Struktura pól

Pola zwracane przez zapytanie o dane z rozdziałów KRS mogą mieć formę prostą lub grupową.

**Przykład pola w formie prostej:**

```
"nazwa_krotka": {
    "_wartosc": "EXAMPLEX POLSKA",
    "_zakres": {
        "wpis_wprowadzajacy_numer": 7,
        "wpis_wprowadzajacy_data": "2010-02-03"
    }
}
```

Powyższy format pola zawiera:

- nazwę pola (tu: `nazwa_krotka`)
- aktualną wartość pola (tu: `EXAMPLEX POLSKA`)
- informację od kiedy ta wartość jest obowiązująca (tu: od wpisu do KRS nr `7`, z dnia `2010-02-03`)

**Przykład pola w formie grupowej:**

```
"przedmiot_pozostalej_dzialalnosci_przedsiebiorcy": {
    "_podobiekty": {
        "3": {
            "_wartosc": {
                "symbol": [
                    "46",
                    null,
                    null
                ],
                "opis": "Handel hurtowy, z wyłączeniem handlu pojazdami samochodowymi"
            },
            "_zakres": {
                "wpis_wprowadzajacy_numer": 1,
                "wpis_wprowadzajacy_data": "2011-03-04"
            }
        },
        "6": {
            "_wartosc": {
                "symbol": [
                    "46",
                    "90",
                    "Z"
                ],
                "opis": "Sprzedaż hurtowa niewyspecjalizowana"
            },
            "_zakres": {
                "wpis_wprowadzajacy_numer": 5,
                "wpis_wprowadzajacy_data": "2012-04-05"
            }
        },
        "7": {
            "_wartosc": {
                "symbol": [
                    "46",
                    "61",
                    "Z"
                ],
                "opis": "Sprzedaż hurtowa maszyn I urządzeń rolniczych oraz dodatkowego wyposażenia"
            },
            "_zakres": {
                "wpis_wprowadzajacy_numer": 5,
                "wpis_wprowadzajacy_data": "2012-04-05"
            }
        }
    },
    "_wartosc": {
        "podobiekty": [
            3,
            6,
            7
        ],
        "podobiekty_liczba_aktualnych": 3,
        "podobiekty_liczba_wszystkich": 7
    },
    "_zakres": {
        "wpis_wprowadzajacy_numer": 5,
        "wpis_wprowadzajacy_data": "2012-04-05"
    }
}
```

Powyższy format pola zawiera:

- nazwę pola (tu: `przedmiot_pozostalej_dzialalnosci_przedsiebiorcy`)
- podstrukturę `_podobiekty` zawierającą aktualne pola podrzędne; każde z nich może być w formacie prostym lub grupowym (tu: format prosty); każde z nich ma numer porządkowy (tu: `3`, `6`, `7`)
- wartość pola (w strukturze `_wartosc`), która jest listą numerów porządkowych pól podrzędnych aktualnych na dzisiaj (`podobiekty`, tu: `3`, `6`, `7`)
- liczbę aktualnych pól podrzędnych (`podobiekty_liczba_aktualnych`, tu: `3`) oraz wszystkich, w tym historycznych, pól podrzędnych (`podobiekty_liczba_wszystkich`, tu: `7`)
- informację od kiedy ta wartość, czyli konkretna lista pól podrzędnych, jest obowiązująca (tu: od wpisu do KRS nr `5`, z dnia `2012-04-05`); uwaga: niektóre z pól podrzędnych mogły być dodane przez wcześniejszy wpis (tu: pole nr `3`, dodane we wpisie do KRS nr `1`)

## Pola dostępne w rozdziale 'ogolny'

`adres`

Adres

`cel_dzialania`

Cel działania

`czas_na_jaki_zostala_utworzona_organizacja`

Czas na jaki została utworzona organizacja

`czy_obligatoriusze_maja_prawo_do_udzialu_w_zysku`

Czy obligatoriusze mają prawo do udziału w zysku

`czy_umowa_przyznaje_uprawnienia_niewynikajace_z_akcji`

Czy umowa przyznaje uprawnienia indywidualne określonym akcjonariuszom lub tytuły uczestnictwa w dochodach lub majątku spółki nie wynikających z akcji?

`czy_przedsiebiorca_prowadzi_dzialalnosc_gospodarcza_z_innymi_podmiotami`

Czy przedsiębiorca prowadzi działalność gospodarczą z innymi podmiotami

`czy_statut_przyznaje_uprawnienia_osobiste_okreslonym_akcjonariuszom`

Czy statut przynaje uprawnienia osobiste określonym akcjonariuszom

`czy_wspolnik_moze_miec`

Czy wspólnik może mieć: jeden udział lub większą liczbę udziałów

`czy_zarzad_lub_rada_administrujaca_sa_upowaznieni_do_emisji_warrantow_subskrypcyjnych`

Czy zarząd lub rada administrująca, są upoważnieni do emisji warrantów subskrypcyjnych

`czy_zlozono_plan`

Czy złożono plan przeniesienia siedziby

`dane_czlonkow_europejskiego_zgrupowania_interesow_gospodarczych.czy_czlonek_ma_ograniczona_zdolnosc`

Dane członków europejskiego zgrupowania interesów gospodarczych - czy członek ma ograniczoną zdolność do podejmowania czynności prawnych

`dane_czlonkow_europejskiego_zgrupowania_interesow_gospodarczych.czy_czlonek_pozostaje_w_zwiazku_malzenskim`

Dane członków europejskiego zgrupowania interesów gospodarczych - czy członek pozostaje w związku małżeńskim

`dane_czlonkow_europejskiego_zgrupowania_interesow_gospodarczych.czy_istenija_klauzule_zwlaniajace_czlonka`

Dane członków europejskiego zgrupowania interesów gospodarczych - czy istnieją klauzule zwalniające członka

`dane_czlonkow_europejskiego_zgrupowania_interesow_gospodarczych.czy_powstala_rozdzielnosc_majatkowa_miedzy_malzonkami`

Dane członków europejskiego zgrupowania interesów gospodarczych - czy powstała rozdzielność majątkowa między małżonkami

`dane_czlonkow_europejskiego_zgrupowania_interesow_gospodarczych.czy_zostala_zawarta_malzenska_umowa_majatkowa`

Dane członków europejskiego zgrupowania interesów gospodarczych - czy została zawarta małżeńska umowa majątkowa

`dane_czlonkow_europejskiego_zgrupowania_interesow_gospodarczych.forma_prawna`

Dane członków europejskiego zgrupowania interesów gospodarczych - forma prawna

`dane_czlonkow_europejskiego_zgrupowania_interesow_gospodarczych.organization`

Dane członków europejskiego zgrupowania interesów gospodarczych - informacje o organizacji

`dane_czlonkow_europejskiego_zgrupowania_interesow_gospodarczych.oznaczenie_panstwa_nazwa_rejestru`

Dane członków europejskiego zgrupowania interesów gospodarczych - oznaczenie państwa, nazwa rejestru

`dane_czlonkow_europejskiego_zgrupowania_interesow_gospodarczych.person`

Dane członków europejskiego zgrupowania interesów gospodarczych - informacje o osobie

`dane_czlonkow_europejskiego_zgrupowania_interesow_gospodarczych.siedziba`

Dane członków europejskiego zgrupowania interesów gospodarczych - siedziba

`dane_jedynego_akcjonariusza.czy_wspolnik_posiada_calosc_akcji_spolki`

Dane jedynego akcjonariusza - czy wspólnik posiada całość akcji spółki

`dane_jedynego_akcjonariusza.organization`

Dane jedynego akcjonariusza - informacje o organizacji

`dane_jedynego_akcjonariusza.person`

Dane jedynego akcjonariusza - informacje o osobie

`dane_komplementariuszy.czy_komplementariusz_ma_ograniczona_zdolnosc_do_czynnosci_prawnych`

Czy komplementariusz ma ograniczoną zdolność do czynności prawnych

`dane_komplementariuszy.czy_powstala_rozdzielnosc_majatkowa_miedzy_malzonkami`

Dane komplementariuszy - czy powstała rozdzielność majątkowa między małżonkami

`dane_komplementariuszy.czy_wspolnik_pozostaje_w_zwiazku_malzenskim`

Dane komplementarisuzy - czy wspólnik pozostaje w związku małżeńskim

`dane_komplementariuszy.czy_zostala_zawarta_malzenska_umowa_majatkowa`

Dane komplementariuszy - czy została zawarta małżeńska umowa majątkowa

`dane_komplementariuszy.organization`

Dane komplementariuszy - informacje o organizacji

`dane_komplementariuszy.person`

Dane komplementariuszy - informacje o osobie

`dane_o_poprzedniej_rejestracji_zgrupowania_w_innym_panstwie`

Informacja o poprzedniej rejestracji zgrupowania w innym państwie

`dane_o_wczesniejszej_rejestracji`

Informacja o wcześniejszej rejestracji

`dane_partnerow.czy_partner_ma_ograniczona_zdolnosc_do_czynnosci_prawnych`

Czy partner ma ograniczoną zdolność do czynności prawnych

`dane_partnerow.czy_partner_ponosi_odpowiedzialnosc`

Czy partner ponosi odpowiedzialność

`dane_partnerow.czy_powstala_rozdzielnosc_majatkowa_miedzy_malzonkami`

Dane partnerów - czy powstała rozdzielność majątkowa między małżonkami

`dane_partnerow.czy_wspolnik_pozostaje_w_zwiazku_malzenskim`

Czy wspólnik pozostaje w związku małżeńskim

`dane_partnerow.czy_zostala_zawarta_malzenska_umowa_majatkowa`

Dane partnerów - czy została zawarta małżeńska umowa majątkowa

`dane_partnerow.person`

Dane partnerów - informacje o osobie

`dane_pelnomocnika.organization`

Dane pełnomocnika uprawnionego do działania w zakresie działalności przedsiębiorstwa zagranicznego - informacje o organizacji

`dane_pelnomocnika.person`

Dane pełnomocnika uprawnionego do działania w zakresie działalności przedsiębiorstwa zagranicznego - informacje o osobie

`dane_pelnomocnika.zakres_umocowania`

Dane pełnomocnika uprawnionego do działania w zakresie działalności przedsiębiorstwa zagranicznego - zakres umocowania

`dane_wspolnikow.czy_jest_w_tym_wklad_niepieniezny`

Dane wspólników - czy jest wkład niepieniężny

`dane_wspolnikow.czy_powstala_rozdzielnosc_majatkowa_miedzy_malzonkami`

Dane wspólników - czy powstała rozdzielność majątkowa między małżonkami

`dane_wspolnikow.czy_wspolnik_jest_komandytariuszem`

Informacja czy wspólnik jest komandytariuszem

`dane_wspolnikow.czy_wspolnik_ma_ograniczona_zdolnosc_do_czynnosci_prawnych`

Informacja czy wspólnik ma ograniczoną zdolność do czynności prawnych

`dane_wspolnikow.czy_wspolnik_posiada_calosc_akcji_spolki`

Informacja czy wspólnik posiada całość akcji spółki

`dane_wspolnikow.czy_wspolnik_pozostaje_w_zwiazku_malzenskim`

Informacja czy wspólnik pozostaje w związku małżeńskim

`dane_wspolnikow.czy_zostala_zawarta_malzenska_umowa_majatkowa`

Dane wspólnika - czy została zawarta małżeńska umowa majątkowa

`dane_wspolnikow.organization`

Dane wspólników - informacje o organizacji

`dane_wspolnikow.person`

Dane wspólników - informacje o osobie

`dane_wspolnikow.posiadane_przez_wspolnika_udzialy`

Dane wspólników - informacja o posiadanych przez wspólników udziałach (słownie, bezpośrednio z KRS)

`dane_wspolnikow.posiadane_przez_wspolnika_udzialy.cena_udzialu`

(Opcjonalnie) Dane wspólników - informacja o posiadanych przez wspólników udziałach - cena jednego udziału (wartość wyliczona z pola słownego)

`dane_wspolnikow.posiadane_przez_wspolnika_udzialy.liczba`

(Opcjonalnie) Dane wspólników - informacja o posiadanych przez wspólników udziałach - liczba udziałów (wartość wyliczona z pola słownego)

`dane_wspolnikow.posiadane_przez_wspolnika_udzialy.wartosc`

(Opcjonalnie) Dane wspólników - informacja o posiadanych przez wspólników udziałach - wartość udziałów (wartość wyliczona z pola słownego)

`dane_wspolnikow.wartosc_wkladu_umowionego`

Dane wspólników - wartość wkładu umówionego

`dane_wspolnikow.wklad_wniesiony.czy_jest_to_wklad_niepieniezny`

Dane wspólników - informacja czy wkład wniesiony jest wkładem niepieniężnym

`dane_wspolnikow.wklad_wniesiony.wartosc_wkladu_wniesionego`

Dane wspólników - wartość wkładu wniesionego

`dane_wspolnikow.wklad_zwrocony.czy_jest_to_wklad_niepieniezny`

Dane wspólników - informacja czy wkład zwrócony jest wkładem niepieniężnym

`dane_wspolnikow.wklad_zwrocony.wartosc_wkladu_zwroconego`

Dane wspólników - wartość wkładu zwróconego

`dane_wspolnikow.wysokosc_sumy_komandytowej`

Dane wspólników - wysokość sumy komandytowej

`decyzja_wykreslenie_data`

Informacja na temat daty decyzji o wykreśleniu z KRS

`decyzja_wykreslenie_nazwa_organu`

Informacja na temat organu wykreślającego z KRS

`decyzja_wykreslenie_numer`

Informacja na temat numeru decyzji o wykreśleniu z KRS

`dzien_konczacy_pierwszy_rok_obrotowy_za_ktory_nalezy_zlozyc_sprawozdanie_finansowe`

Dzień konczący pierwszy rok obrotowy, za który należy złożyć sprawozdanie finansowe

`email`

Adres e-mail

`forma_prawna`

Forma prawna

`informacje_o_udzialach.nazwa_kategorii`

Informacja o udziałach - nazwa kategorii

`informacje_o_udzialach.wartosc_nominalna_udzialow_tej_samej_kategorii`

Informacja o udziałach - wartość nominalna udziałów tej samej kategorii

`inne_dane.data_cofniecia_zezwolenia`

`inne_dane.data_uznania_towarzystwo_za_male_towarzystwo_ubezpieczen_wzajemnych`

Data uznania towarzystwa za małe towarzystwo ubezpieczeń wzajemnych

`inne_dane.informacja_o_czesciowym_ograniczeniu_zezwolenia_na_prowadzenie_towarzystwa`

`inne_dane.oznaczenie_dzialu`

Oznaczenie działu ubezpieczeń objętego działalnością towarzystwa ubezpieczeń / reasekuracji

`inne_dane.oznaczenie_terytorialne`

Oznaczenie terytorialnego zasięgu towarzystwa ubezpieczeń / reasekuracji

`komitet_zalozycielski.organization`

Komitet założycielski - informacje o organizacji

`komitet_zalozycielski.person`

Komitet założycielski - informacje o osobie

`kurator.data_do_ktorej_ma_dzialac`

Data, do której ma działać Kurator

`kurator.data_powolania`

Data powołania Kuratora

`kurator.organization`

Kurator - informacje o organizacji

`kurator.person`

Kurator - informacje o osobie

`kurator.podstawa_powolania_i_zakres_dzialania`

Podstawa powołania i zakres działania kuratora

`kwotowe_okreslenie_czesci_kapitalu_pokrytego`

kwotowe określenie części kapitału pokrytego

`kwotowe_okreslenie_czesci_kapitalu_wplaconego`

Kwotowe okreslenie części kapitału wpłaconego

`minister_nadzorujacy.name`

Nazwa Ministra nadzorującego

`minister_nadzorujacy.regon`

Numer regon Ministra nadzorującego

`nazwa`

Nazwa organizacji

`nazwa_krotka`

Nazwa krótka organizacji

`nazwa_rejestru_numer_w_rejestrze_okreslenie_organu_prowadzacego_rejestr`

Określeie organu prowadzącego rejestr

`nip`

Nr NIP

`notyfikacja_bris`

Notyfikacja BRIS

`numer_i_data_decyzji_prezesa_uokik_o_zgodzie_na_koncentracje`

Numer i data decyzji Prezesa UOKIK o zgodzie na koncentrację

`okreslenie_okolicznosci_powstania`

Określenie okoliczności powstania podmiotu

`opis_sposobu_powstania_podmiotu`

Opis sposobu powstania podmiotu

`opp`

Czy podmiot posiada status organizacji pożytku publicznego

`organ_nadzoru.dane_osob.organization`

Organ nadzoru. Dane osób - informacje o organizacji

`organ_nadzoru.dane_osob.person`

Organ nadzoru. Dane osób - informacje o osobie

`organ_nadzoru.nazwa_organu`

Organ nadzoru - nazwa organu

`organ_reprezentacji.dane_osob.czy_osoba_wchodzaca_w_sklad_zarzadu_zostala_zawieszona_w_czynnosciach`

Organ reprezentacji - informacja czy osoba wchodząca w skład zarządu została zawieszona w czynnościach

`organ_reprezentacji.dane_osob.data_do_jakiej_zostala_zawieszona`

Organ reprezentacji - informacja o dacie do jakiej osoba została zawieszona

`organ_reprezentacji.dane_osob.funkcja_w_organie`

Organ reprezentacji - funkcja osoby w organie

`organ_reprezentacji.dane_osob.okreslenie_osoby`

Organ reprezentacji - określenie osoby

`organ_reprezentacji.dane_osob.organization`

Organ reprezentacji - informacje o organizacji

`organ_reprezentacji.dane_osob.person`

Organ reprezentacji - informacje o osobie

`organ_reprezentacji.nazwa_organu_reprezentacji_podmiotu`

Organ reprezentacji - nazwa organu reprezentacji podmiotu

`organ_reprezentacji.organ_reprezentacji_kwalifikacja_kierownika`

Organ reprezentacji - kwalifikacje kierownika

`organ_reprezentacji.osoba`

Organ reprezentacji - informacje o osobie

`organ_reprezentacji.sposob_reprezentacji_podmiotu`

Organ reprezentacji - sposób reprezentacji podmiotu

`organ_reprezentacji_zagranicznego_przedsiebiorcy.dane_osob.funkcja`

Organ reprezentacji zagranicznego przedsiębiorcy - funkcja

`organ_reprezentacji_zagranicznego_przedsiebiorcy.dane_osob.person`

Organ reprezentacji zagranicznego przedsiębiorcy - informacje o osobie

`organ_reprezentacji_zagranicznego_przedsiebiorcy.nazwa`

Organ reprezentacji zagranicznego przedsiębiorcy - nazwa

`organ_reprezentacji_zagranicznego_przedsiebiorcy.sposob_reprezentacji`

Organ reprezentacji zagranicznego przedsiębiorcy - sposób reprezentacji

`organ_sprawujacy_nadzor.name`

Organ sprawujący nadzór - nazwa

`organ_zalozycielski.name`

Organ założycielski - nazwa

`organ_zalozycielski.regon`

Organ założycielski - numer regon

`osoba_pozwolenie.address`

Pozwolenie - adres

`osoba_pozwolenie.first_names`

Pozwolenie - imiona osoby

`osoba_pozwolenie.last_name`

Pozwolenie - nazwisko osoby

`osoba_pozwolenie.name`

Pozwolenie - pełne imię i nazwisko osoby

`osoby_reprezentujace_zagranicznego_przedsiebiorcy_w_oddziale.funkcja`

Osoby reprezentujące zagranicznego przedsiębiorcy - funkcja

`osoby_reprezentujace_zagranicznego_przedsiebiorcy_w_oddziale.person`

Osoby reprezentujące zagranicznego przedsiębiorcy - informacje o osobie

`oznaczenie_pisma_innego_niz_msig_przeznaczonego_do_ogloszen`

Oznaczenie pisma innego niż MSIG przeznaczonego do ogłoszeń

`panstwo_nazwa_rejestru`

Państwo, do którego przeniesiono siedzibę spółki, nazwa rejestru, w którym wpisano spółkę, organ prowadzący rejestr oraz numer w rejestrze

`pelnomocnicy.organization`

Pełnomocnicy - informacje o organizacji

`pelnomocnicy.person`

Pełnomocnicy - informacje o osobie

`pelnomocnicy.zakres_pelnomocnictwa`

Pełnomocnicy - zakres pełnomocnictwa

`prawo_panstwa_wlasciwego_dla_przedsiebiorcy_zagranicznego`

Prawo państwa właściwego dla przedsiębiorcy zagranicznego

`prokurenci.person`

Prokurenci - informacje o osobie

`prokurenci.rodzaj_prokury`

Prokurenci - rodzaj prokury

`przedmiot_dzialalnosci_statutowej_nieodplatna_dzialalnosc_statutowa`

Nieodpłatna działalność statutowa

`przedmiot_dzialalnosci_statutowej_odplatna_dzialalnosc_statutowa`

Odpłatna działalność statutowa

`przedmiot_pozostalej_dzialalnosci_przedsiebiorcy`

Przedmiot pozostałej działalności przedsiębiorcy

`przedmiot_przewazajacej_dzialalnosci_przedsiebiorcy`

Przedmiot przeważającej działalności przedsiębiorcy

`przedsiebiorca_zagraniczny`

Informacje o osobie przedsiębiorcy zagranicznego

`regon`

Nr REGON

`rozwiazanie_lub_uniewaznienie_informacja`

Informacja o rozwiązaniu lub unieważnieniu podmiotu

`rozwiazanie_lub_uniewaznienie_okolicznosci`

Okoliczności rozwiązania lub unieważnienia podmiotu

`siedziba`

Siedziba

`siedziba_i_adres_zakladu_glownego_przedsiebiorcy_zagranicznego`

Siedziba i adres zakładu głównego przedsiebiorcy zagranicznego

`umorzenie_nazwa_organu_prowadzacego_egzekucje`

Umorzenie - nazwa organu prowadzącego egzekucję

`wartosc_nominalna_warunkowego_podwyzszenia_kapitalu_zakladowego`

Wartość nominalna warunkowego podwyższenia kapitału zakładowego

`www`

Adres strony internetowej podmiotu

`wysokosc_kapitalu_docelowego`

Wysokość kapitału docelowego

`wysokosc_kapitalu_zakladowego`

Wysokość kapitału zakładowego

`wysokosc_kapitalu_akcyjnego`

Wysokość kapitału akcyjnego

`wysokosc_kapitalu_zapasowego`

Wysokość kapitału zapasowego

`wzmianka_ze_kapital_nie_zostal_pokryty`

Kapitał spółki / towarzystwa / spółdzielni: wzmianka, że kapitał nie został pokryty

`zarzad_komisaryczny.czas`

Zarząd komisaryczny - określenie czasu

`zarzad_komisaryczny.dane_zarzadcy.organization`

Zarząd komisaryczny - dane zarządcy - informacje o organizacji

`zarzad_komisaryczny.dane_zarzadcy.person`

Zarząd komisaryczny - dane zarządcy - informacje o osobie

`zarzad_komisaryczny.reprezentacja`

Zarząd komisaryczny - reprezentacja

`zarzad_komisaryczny.rodzaj`

Zarząd komisaryczny - rodzaj

`zawieszenie_dzialalnosci_gospodarczej.data_wznowienia`

Zawieszenie działalności gospodarczej - data wznowienia

`zawieszenie_dzialalnosci_gospodarczej.data_zawieszenia`

Zawieszenie działalności gospodarczej - data zawieszenia

`zezwolenie_oznaczenie_organu_ktory_wydal_zezwolenie_numer_i_data_zezwolenia`

Zezwolenie na działanie przedsiębiorstwa w Polsce: oznaczenie organu, który wydał zezwolenie - numer i data zezwolenia

## Pola dostępne w rozdziale 'oddzialy'

`oddzialy.adres`

Oddziały - adres

`oddzialy.nazwa`

Oddziały - nazwa

`oddzialy.siedziba`

Oddziały - siedziba

## Pola dostępne w rozdziale 'akcje'

`emisja_akcji.liczba_akcji_w_danej_serii`

Emisja akcji - liczba akcji w danej serii

`emisja_akcji.nazwa_serii_akcji`

Emisja akcji - nazwa serii akcji

`emisja_akcji.rodzaj_uprzywilejowania_i_liczba_akcji_uprzywilejowanych`

Emisja akcji - rodzaj uprzywilejowania i liczba akcji uprzywilejowanych

`liczba_akcji_wszystkich_emisji`

Liczba akcji wszystkich emisji

`liczba_udzialow_wszystkich_kategorii`

Liczba udziałów wszystkich kategorii

`czy_akcjonariusze_wnosza_wklad_niepieniezny`

Czy akcjonariusze wnoszą wkład niepieniężny?

`maksymalna_liczba_akcji_warunkowej_emisji`

Maksymalna liczba akcji, które mogą być przedmiotem warunkowej emisji

`maksymalna_liczba_akcji_z_upowaznienia`

Maksymalna liczba akcji, które mogą zostać wyemitowane z upoważnienia udzielonego zarządowi albo radzie dyrektorów

`okreslenie_wartosc_akcji_objetych_za_aport`

Określenie wartości akcji objętych za aport

`wartosc_nominalna_akcji`

Wartość nominalna akcji

`wartosc_udzialow_objetych_za_aport`

Wartość udziałów objętych za aport

## Pola dostępne w rozdziale 'wzmianki'

`dokumenty_wzmianka_o_braku_obowiazku_sporzadzenia_i_zlozenia_rocznego_sprawozdania_finansowego`

Wzmianka o braku obowiązku sporządzenia i złożenia rocznego sprawozdania finansowego

`dokumenty_wzmianka_o_zlozeniu_opinii_bieglego_rewidenta`

Wzmianka o złożeniu opinii biegłego rewidenta

`dokumenty_wzmianka_o_zlozeniu_rocznego_sprawozdania_finansowego`

Wzmianka o złożeniu rocznego sprawozdania finansowego

`dokumenty_wzmianka_o_zlozeniu_sprawozdania_z_dzialalnosci_podmiotu`

Wzmianka o złożeniu sprawozdania z działalności podmiotu

`dokumenty_wzmianka_o_zlozeniu_sprawozdania_z_platnosci_na_rzecz_administracji_publicznej`

Wzmianka o złożeniu sprawozdania z płatności na rzecz administracji publicznej

`dokumenty_wzmianka_o_zlozeniu_uchwaly_lub_postanowienia_o_zatwierdzeniu_skonsolidowanego_rocznego_sprawozdania_finansowego`

Wzmianka o złożeniu ucghwały lub postanowienia o zatwierdzeniu skonsolidowanego rocznego sprawozdania finansowego

`sprawozdania_wzmianka_o_zlozeniu_skonsolidowanego_rocznego_sprawozdania_finansowego`

Wzmianka o złożeniu skonsolidowanego rocznego sprawozdania finansowego

`sprawozdania_wzmianka_o_zlozeniu_sprawozdania_z_dzialalnosci_spolki_dominujacej`

Wzmianka o złożeniu sprawozdania z działalności spółki dominującej

`sprawozdania_wzmianka_o_zlozeniu_opinii_bieglego_rewidenta_sprawozdania_z_badania_skonsolidowanego_rocznego_sprawozdania_finansowego`

Wzmianka o złożeniu opinii biegłego rewidenta - sprawozdania z badania skonsolidowanego rocznego sprawozdania finansowego

`sprawozdania_wzmianka_o_zlozeniu_uchwaly_lub_postanowienia_o_zatwierdzeniu_skonsolidowanego_rocznego_sprawozdania_finansowego`

Wzmianka o złożeniu uchwały lub postanowienia o zatwierdzeniu skonsolidowanego rocznego sprawozdania finansowego

## Pola dostępne w rozdziale 'zobowiazania'

`wierzytelnosci.dane_wierzycieli.organization`

Wierzytelności - dane wierzycieli - informacje o organizacji

`wierzytelnosci.dane_wierzycieli.person`

Wierzytelności - dane wierzycieli - informacje o osobie

`wierzytelnosci.kwota_lub_opis`

Wierzytelności - kwota lub opis

`wierzytelnosci.solidarna`

Wierzytelności - czy wierzytelność jest solidarna

`wierzytelnosci.tytul_wykonawczy`

Wierzytelności - tytuł wykonawczy

`zaleglosci.charakter`

Charakter zaległości

`zaleglosci.informacja_o_zakonczeniu_egzekucji`

Informacja o zakończeniu egzekucji w sprawie zaległości

`zaleglosci.oznaczenie_organu_wystawiajacego_tytul_wykonawczy`

Oznaczenie organu wystawiającego tytuł wykonawczy w sprawie zaległości

`zaleglosci.wysokosc_zaleglosci`

Wysokość zaległości

## Pola dostępne w rozdziale 'przeksztalcenia'

`informacja_o_sporzadzeniu_lub_zmianie_umowy`

Informacja o sporządzeniu lub zmianie umowy

`likwidacja.dane_likwidatorow.organization`

Dane likwidatorów - informacje o organizacji

`likwidacja.dane_likwidatorow.person`

Dane likwidatorów - informacje o osobie

`likwidacja.dotyczy`

Czego dotyczy likwidacja (ma zastosowanie dla przedsiębiorstw zagranicznych)

`likwidacja.informacja_o_otwarciu`

Informacja o otwarciu likwidacji

`likwidacja.informacja_o_zakonczeniu`

Informacja o zakończeniu likwidacji

`likwidacja.sposob_reprezentacji_podmiotu_przez_likwidatorow`

Sposób reprezentacji przez likwidatorów

`oddalone_wnioski_o_ogloszenie_upadlosci.dalsze_pelnienie_funkcji`

Oddalone wnioski o ogłoszenie upadłości - dalsze pełnienie funkcji

`oddalone_wnioski_o_ogloszenie_upadlosci.oddalenie_wniosku`

Oddalone wnioski o ogłoszenie upadłości - oddalenie wniosku

`oddalone_wnioski_o_ogloszenie_upadlosci.zabezpieczenie_majatku_w_postepowaniu_restrukturyzacyjnym`

Oddalone wnioski o ogłoszenie upadłości - zabezpieczenie majątku w postępowaniu restrukturyzacyjnym

`oddalone_wnioski_o_ogloszenie_upadlosci.zabezpieczenie_majatku_w_postepowaniu_upadlosciowym`

Oddalone wnioski o ogłoszenie upadłości - zabezpieczenie majątku w postępowaniu upadłościowym

`podmioty_z_ktorych_powstala_organizacja.country`

Podmioty, z których powstała organizacja - kraj

`podmioty_z_ktorych_powstala_organizacja.name`

Podmioty, z których powstała organizacja - nazwa

`podmioty_z_ktorych_powstala_organizacja.nazwa_sadu_prowadzacego_rejestr`

Podmioty, z których powstała organizacja - nazwa Sądu prowadzącego rejestr

`podmioty_z_ktorych_powstala_organizacja.nip`

Podmioty, z których powstała organizacja - numer NIP

`podmioty_z_ktorych_powstala_organizacja.numer_w_rejestrze`

Podmioty, z których powstała organizacja - numer w rejestrze

`podmioty_z_ktorych_powstala_organizacja.regon`

Podmioty, z których powstała organizacja - numer REGON

`podmiot_tworzacy`

Podmiot tworzący (np. SPZOZ, kolumnę transportu sanitarnego) - nazwa, nr KRS, nr REGON, itp.

`polaczenie_podzial_przeksztalcenie.dane_podmiotow_powstalych.kraj_i_nazwa_rejestru_lub_ewidencji`

Połączenie, podział, przekształcenie - podmioty powstałe - kraj i nazwa rejestru lub ewidencji

`polaczenie_podzial_przeksztalcenie.dane_podmiotow_powstalych.nazwa_sadu_prowadzacego_rejestr`

Połączenie, podział, przekształcenie - podmioty powstałe -nazwa Sądu prowadzącego rejestr

`polaczenie_podzial_przeksztalcenie.dane_podmiotow_powstalych.numer_w_rejestrze`

Połączenie, podział, przekształcenie - podmioty powstałe - numer w rejestrze

`polaczenie_podzial_przeksztalcenie.dane_podmiotow_powstalych.organization`

Połączenie, podział, przekształcenie - podmioty powstałe - informacje o organizacji

`polaczenie_podzial_przeksztalcenie.dane_podmiotow_przejetych.kraj_i_nazwa_rejestru_lub_ewidencji`

Połączenie, podział, przekształcenie - podmioty przejęte - kraj i nazwa rejestru lub ewidencji

`polaczenie_podzial_przeksztalcenie.dane_podmiotow_przejetych.nazwa_sadu_prowadzacego_rejestr`

Połączenie, podział, przekształcenie - podmioty przejęte - nazwa Sądu prowadzącego rejestr

`polaczenie_podzial_przeksztalcenie.dane_podmiotow_przejetych.numer_w_rejestrze`

Połączenie, podział, przekształcenie - podmioty przejęte - numer w rejestrze

`polaczenie_podzial_przeksztalcenie.dane_podmiotow_przejetych.organization`

Połączenie, podział, przekształcenie - podmioty przejęte - informacje o organizacji

`polaczenie_podzial_przeksztalcenie.informacja`

Połączenie, podział, przekształcenie - informacja

`polaczenie_podzial_przeksztalcenie.okolicznosci`

Połączenie, podział, przekształcenie - określenie okoliczności

`polaczenie_podzial_przeksztalcenie.opis`

Połączenie, podział, przekształcenie - opis

`postepowanie_ukladowe.otwarcie_postepowania`

Postępowanie układowe - otwarcie postępowania

`postepowanie_ukladowe.uchylenie_ukladu`

Postępowanie układowe - uchylenie układu

`postepowanie_ukladowe.zakonczenie_postepowania`

Postępowanie układowe - zakończenie postępowania

`postepowanie_upadlosciowe.dane_osoby_powolanej.funkcja`

Postępowanie upadłościowe - dane osoby powołanej - funkcja

`postepowanie_upadlosciowe.dane_osoby_powolanej.organization`

Postępowanie upadłościowe - dane osoby powołanej - informacje o organizacji

`postepowanie_upadlosciowe.dane_osoby_powolanej.person`

Postępowanie upadłościowe - dane osoby powołanej - informacje o osobie

`postepowanie_upadlosciowe.dane_osoby_powolanej.okreslenie_osoby`

Postępowanie upadłościowe - dane osoby powołanej - określenie osoby

`postepowanie_upadlosciowe.dane_syndyka.organization`

Postępowanie upadłościowe - dane syndyka - informacje o organizacji

`postepowanie_upadlosciowe.dane_syndyka.person`

Postępowanie upadłościowe - dane syndyka - informacje o osobie

`postepowanie_upadlosciowe.ogloszenie_upadlosci`

Postępowanie upadłościowe - ogłosenie upadłości

`postepowanie_upadlosciowe.sposob_prowadzenia_postepowania`

Postępowanie upadłościowe - sposób prowadzenia postępowania

`postepowanie_upadlosciowe.uchylenie_ukladu`

Postępowanie upadłościowe - uchylenie układu

`postepowanie_upadlosciowe.zakonczenie_postepowania`

Postępowanie upadłosciowe - zakończenie postepowania

`restrukturyzacja.dane_nadzorcy.funkcja`

Restrukturyzacja - dane nadzorcy - funkcja

`restrukturyzacja.dane_nadzorcy.organization`

Restrukturyzacja - dane nadzorcy - informacje o organizacji

`restrukturyzacja.dane_nadzorcy.person`

Restrukturyzacja - dane nadzorcy - informacje o osobie

`restrukturyzacja.otwarcie`

Restrukturyzacja - otwarcie

`restrukturyzacja.uchylenie_ukladu`

Restrukturyzacja - uchylenie układu

`restrukturyzacja.zakonczenie`

Restrukturyzacja - zakończenie
