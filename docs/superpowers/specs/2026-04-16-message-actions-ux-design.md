# Message Actions UX — Design Spec

**Data:** 2026-04-16
**Branch:** CU-86b9e1mf5-Przycisk-Regeneruj-odpowiedz-przy-ostatniej-wiadomosci-asystenta
**Status:** Zatwierdzone

---

## Kontekst

Pasek akcji wiadomości asystenta (`MessageActions` w `ChatOutput.tsx`) zawiera kilka przycisków (👍 👎 📋 `</>` 🔊 ↻), które mają niespójny UX:

1. Brak tooltipów na Like, Dislike, ReadAnswer — tylko RegenerateButton ma tooltip
2. Dwa przyciski kopiowania (📋 "Kopiuj tekst" i `</>` "Kopiuj Markdown") — redundancja
3. Różne klasy kolorystyczne — RegenerateButton ma `text-muted-foreground hover:text-foreground`, pozostałe nie

---

## Decyzje projektowe

| Decyzja | Wybór | Uzasadnienie |
|---------|-------|--------------|
| Tooltip | `<Tooltip>` z `@ragenai/common-ui` | Już w projekcie, spójny z resztą UI, opóźnienie 300ms |
| Kopiowanie | Jeden przycisk + Radix DropdownMenu | `radix-ui` jest w projekcie, lepszy a11y, brak duplikacji |
| Styl przycisków | `text-muted-foreground hover:text-foreground transition-colors` | Spójny z RegenerateButton |

---

## Architektura

### Pliki do modyfikacji

| Plik | Zmiana |
|------|--------|
| `src/app/components/Assistant/ChatOutput/CopyToClipboardButton.tsx` | Jeden trigger + Radix DropdownMenu + Tooltip |
| `src/app/components/Assistant/ChatOutput/RateAnswer.tsx` | Tooltip na 👍 i 👎 + spójny styl |
| `src/app/components/Assistant/ChatOutput/ReadAnswer/ReadAnswer.tsx` | Tooltip na 🔊 + spójny styl |
| `src/app/components/Assistant/ChatOutput/RegenerateButton.tsx` | Zamiana `title` na `<Tooltip>` |
| `src/app/messages/pl.json` | Nowe klucze i18n dla tooltipów |
| `src/app/messages/en.json` | Nowe klucze i18n dla tooltipów |

---

## Szczegóły implementacji

### Wspólny styl przycisku

Każdy przycisk akcji używa tych samych klas Tailwind:

```
inline-flex items-center justify-center rounded p-0.5
text-muted-foreground hover:text-foreground transition-colors
```

### `CopyToClipboardButton` — Radix DropdownMenu

```tsx
import { DropdownMenu } from 'radix-ui';

// Jeden trigger zamiast dwóch przycisków:
<Tooltip id="copy-btn" content={t('copy')}>
  <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild>
      <button type="button" className={ACTION_BUTTON_CLS}>
        {copiedType ? <CheckIcon className="size-4 text-green-500" /> : <DocumentDuplicateIcon className="size-4" />}
      </button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Content>
      <DropdownMenu.Item onSelect={copyFormattedText}>
        Kopiuj tekst
      </DropdownMenu.Item>
      <DropdownMenu.Item onSelect={copyMarkdown}>
        Kopiuj Markdown
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Root>
</Tooltip>
```

### `RateAnswer` — Tooltip na Like/Dislike

```tsx
<Tooltip id={`like-${messageId}`} content={t('like')}>
  <button className={ACTION_BUTTON_CLS} onClick={() => handleRateMessage('up')}>
    <LikeIcon rated={rated} />
  </button>
</Tooltip>
<Tooltip id={`dislike-${messageId}`} content={t('dislike')}>
  <button className={ACTION_BUTTON_CLS} onClick={() => handleRateMessage('down')}>
    <DislikeIcon rated={rated} />
  </button>
</Tooltip>
```

### `ReadAnswer` — Tooltip

```tsx
<Tooltip id="read-answer" content={t('listen')}>
  <button onClick={handleInitialClick} className={ACTION_BUTTON_CLS}>
    <SoundWave className="h-5 w-5" />
  </button>
</Tooltip>
```

### `RegenerateButton` — zamiana `title` na `<Tooltip>`

```tsx
<Tooltip id="regenerate-btn" content={t('regenerate')}>
  <button
    type="button"
    onClick={handleClick}
    disabled={disabled || isLoading}
    data-testid="regenerate-button"
    className={ACTION_BUTTON_CLS + " disabled:opacity-50 disabled:cursor-not-allowed"}
  >
    <ArrowPathIcon className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
  </button>
</Tooltip>
```

---

## i18n — nowe klucze

```json
// rate-answer namespace (już istnieje)
"like": "Oceń pozytywnie",
"dislike": "Oceń negatywnie"

// read-answer namespace (nowy)
"listen": "Odczytaj odpowiedź"

// success-toast namespace (już istnieje)
"copy": "Kopiuj",
"copy-text": "Kopiuj tekst",
"copy-markdown": "Kopiuj Markdown"
```

---

## Stała `ACTION_BUTTON_CLS`

Aby uniknąć duplikacji klas, każdy plik definiuje lokalnie lub importuje stałą:

```ts
const ACTION_BUTTON_CLS =
  'inline-flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors';
```

Nie tworzymy osobnego pliku/eksportu — każdy komponent definiuje ją lokalnie (YAGNI: tylko 4 miejsca użycia).

---

## Testy

- `CopyToClipboardButton.test.tsx` — zaktualizować: jeden trigger otwiera dropdown, kliknięcie pozycji kopiuje właściwy format
- `RegenerateButton.test.tsx` — zaktualizować: brak atrybutu `title`, obecność `data-tooltip-id`
- `RateAnswer.tsx` i `ReadAnswer.tsx` — nie mają testów komponentów, nie tworzymy nowych (poza zakresem)
