# Document Preview Slideover — Design Spec

**Branch:** `CU-86b9e1h4u-Inline-podglad-dokumentow-w-panelu-wiedzy`  
**Data:** 2026-04-21  
**Ticket:** Inline podgląd dokumentów w panelu wiedzy

---

## Kontekst

Obecnie użytkownik musi pobrać plik, żeby zobaczyć jego zawartość. Dodanie inline viewera poprawia UX przeglądania bazy wiedzy. Istniejący podgląd PDF to natywna przeglądarka — słaby UX. Rozwiązanie: boczny panel (slideover) otwierany klikiem w wiersz dokumentu.

---

## Decyzje projektowe

| Decyzja | Wybór | Uzasadnienie |
|---|---|---|
| Trigger otwarcia | Klik w wiersz tabeli (poza checkbox i dropdown) | Najszybsza ścieżka, wzorzec Google Drive / Notion |
| Layout metadane | Sidebar 30% zawsze widoczny obok podglądu 70% | Metadane i podgląd są równorzędne — ukrywanie za zakładką tworzy pogo-sticking |
| Akcje w panelu | Toolbar w nagłówku slideover | Akcje dotyczą całego dokumentu, nie konkretnego pola; header to ich naturalne miejsce |
| Nawigacja ←/→ | Slideover dostaje `files[]` + `initialIndex`, nawiguje lokalnie | Prostsza implementacja, samowystarczalny komponent, łatwe testowanie |
| Architektura | Nowy komponent `DocumentPreviewSlideOver`, stan w `FileListWrapper` | Zgodna z istniejącym wzorcem MoveDialog/ShareDialog; bez nadmiarowego kontekstu |

---

## Architektura komponentów

```
src/app/components/ManageKnowledge/DocumentPreview/
├── DocumentPreviewSlideOver.tsx       # główny wrapper (overlay + panel)
├── DocumentPreviewHeader.tsx          # nagłówek z akcjami i nawigacją
├── DocumentPreviewMetadata.tsx        # sidebar 30% — metadane + akcje
├── viewers/
│   ├── PdfViewer.tsx                  # react-pdf + paginacja + zoom
│   ├── DocxViewer.tsx                 # mammoth → HTML + DOMPurify
│   ├── MarkdownViewer.tsx             # react-markdown
│   ├── PlainTextViewer.tsx            # TXT, CSV — <pre> ze scroll
│   ├── ImageViewer.tsx                # <img> + object-fit contain
│   └── UnsupportedViewer.tsx          # placeholder + przycisk pobierania
└── hooks/
    └── useDocumentPreview.ts          # fetch URL, nawigacja klawiaturowa
```

### Stan w FileListWrapper

```ts
const [previewFile, setPreviewFile] = useState<UserFileTypeSafe | null>(null);
const [previewIndex, setPreviewIndex] = useState<number>(0);
```

`previewFile` przekazywane do `<DocumentPreviewSlideOver>` i do `<FileListView>` (podświetlenie aktywnego wiersza). Slideover dostaje `files[]` i `previewIndex` — nawigacja odbywa się przez callback `onFileChange(file)` do parenta.

---

## Przepływ danych

### Fetch zawartości

Istniejący endpoint `/api/files/[fileId]` (GET, auth przez session cookie):
- Scope'uje po `organizationId` z sesji — `db.userFile.findFirst({ where: { id, organizationId } })`
- Zwraca `Content-Disposition: inline` dla PDF i obrazów, `attachment` dla reszty
- `Cache-Control: private, max-age=3600`

Nie trzeba nowego endpointu ani signed URL — autentykacja przez cookie wystarczy.

DOCX i tekst: viewer pobiera `ArrayBuffer`/`text` z tego samego endpointu i przetwarza po stronie klienta (mammoth dla DOCX, `TextDecoder` dla TXT/CSV).

### Guard uprawnień

Lista plików filtruje widoczność po stronie serwera (użytkownik widzi tylko pliki, do których ma dostęp). Endpoint 404 dla pliku spoza organizacji. Brak osobnej weryfikacji `DocumentPermission` w endpointcie — istniejący mechanizm wystarczy.

### Hook `useDocumentPreview`

```ts
// wejście
{
  file: UserFileTypeSafe;
  files: UserFileTypeSafe[];
  initialIndex: number;
  isOpen: boolean;
  onFileChange: (file: UserFileTypeSafe, index: number) => void;
}

// wyjście
{
  contentUrl: string;        // `/api/files/${file.id}`
  isLoading: boolean;
  goNext: () => void;
  goPrev: () => void;
  canGoNext: boolean;
  canGoPrev: boolean;
  currentIndex: number;
}
```

Lazy load: `contentUrl` ustawiany dopiero gdy `isOpen === true`. Nawigacja klawiaturowa `←/→` rejestrowana przez `addEventListener('keydown')` wewnątrz hooka, usuwana przy unmount lub zamknięciu.

---

## Layout i UX

### Overlay

- `fixed inset-0` portal (`ReactDOM.createPortal` do `document.body`)
- Tło: `bg-black/40` — klik zamyka
- Panel: wjeżdża z prawej, `transform: translateX`, `transition-transform duration-300`
- Szerokość: `w-[90vw] max-w-5xl`
- Esc zamyka (listener w hooku)

### Układ panelu

```
┌─────────────────────────────────────────────────────┐
│ HEADER: [ikona+nazwa]  [←][→]  [⬇ Pobierz]  [✕]   │
├───────────────────────────────┬─────────────────────┤
│                               │  METADANE (30%)     │
│   PODGLĄD (70%)               │  Nazwa pliku        │
│                               │  Rozmiar / Typ      │
│   PdfViewer / DocxViewer /    │  Data dodania       │
│   MarkdownViewer / etc.       │  Właściciel         │
│                               │  Status embedowania │
│   (lazy load po otwarciu)     │  Folder             │
│                               │  Uprawnienia        │
│                               │  ─────────────────  │
│                               │  [Pobierz]          │
│                               │  [Udostępnij]       │
│                               │  [Przenieś]         │
│                               │  [Usuń]             │
└───────────────────────────────┴─────────────────────┘
```

### PDF toolbar (wewnątrz PdfViewer)

```
[◀] Strona 3 / 12 [▶]    [zoom −] 100% [zoom +]
```

### Responsywność

Poniżej `lg` (1024px): metadane zwijają się do accordionu na dole panelu; podgląd zajmuje pełną szerokość.

### Obsługa klawiatury

| Klawisz | Akcja |
|---|---|
| `Esc` | Zamknij slideover |
| `←` | Poprzedni dokument w liście |
| `→` | Następny dokument w liście |

---

## Mapowanie formatów na viewery

| FileType | Viewer | Mechanizm |
|---|---|---|
| `PDF` | `PdfViewer` | `react-pdf` — `<Document url="/api/files/[id]">` + toolbar paginacji |
| `DOCX` | `DocxViewer` | fetch ArrayBuffer → `mammoth.convertToHtml` → DOMPurify |
| `MARKDOWN` | `MarkdownViewer` | fetch text → `react-markdown` |
| `TEXT`, `CSV` | `PlainTextViewer` | fetch text → `<pre>` ze scroll |
| `IMAGE` (jpg/png/webp/gif) | `ImageViewer` | `<img src="/api/files/[id]">` + `object-fit: contain` |
| `EPUB`, `SRT`, `XLSX`, `URL` | `UnsupportedViewer` | placeholder "Podgląd niedostępny" + przycisk pobierania |

**Nowe zależności:** tylko `react-pdf`. Mammoth, react-markdown, markdown-it już są w projekcie.

---

## Podłączenie do istniejącego kodu

### FileRow (UserFilesTable.tsx)

Dodać `onClick` do `<TableRow>`:

```tsx
<TableRow
  className={...}
  onClick={() => onPreviewFile?.(file)}
  data-testid={`file-row-${file.id}`}
>
```

`e.stopPropagation()` na checkboxie i dropdown-ie zapobiega przypadkowemu otwarciu.

### FileListWrapper (UserFilesWrapper.tsx)

```tsx
const [previewFile, setPreviewFile] = useState<UserFileTypeSafe | null>(null);
const [previewIndex, setPreviewIndex] = useState<number>(0);

const handlePreviewFile = (file: UserFileTypeSafe) => {
  const idx = defaultProjectFiles.findIndex((f) => f.id === file.id);
  setPreviewFile(file);
  setPreviewIndex(idx);
};

// ...w JSX:
<DocumentPreviewSlideOver
  file={previewFile}
  files={defaultProjectFiles}
  initialIndex={previewIndex}
  isOpen={!!previewFile}
  onClose={() => setPreviewFile(null)}
  onFileChange={(f, i) => { setPreviewFile(f); setPreviewIndex(i); }}
  onDelete={(fileId) => { toggleModal(fileId); setPreviewFile(null); }}
  onShare={(fileId) => { /* open ShareDialog */ }}
  onMove={(fileId) => { /* open MoveDialog */ }}
/>
```

---

## Testy

### Vitest (jednostkowe / integracyjne)

| Plik testowy | Co testuje |
|---|---|
| `DocumentPreviewSlideOver.test.tsx` | Render otwarty/zamknięty, Esc zamyka, przekazanie file props |
| `PdfViewer.test.tsx` | Render, loading state, error state |
| `DocxViewer.test.tsx` | Render, loading state, error state |
| `MarkdownViewer.test.tsx` | Render, loading state, error state |
| `ImageViewer.test.tsx` | Render src poprawny |
| `UnsupportedViewer.test.tsx` | Placeholder widoczny, przycisk pobierania |
| `useDocumentPreview.test.ts` | Nawigacja next/prev, granice (pierwszy/ostatni), lazy load |

### Playwright

`e2e/p1-01-document-preview.spec.ts`:
1. Login
2. Otwórz listę dokumentów
3. Klik w wiersz → assert slideover widoczny
4. Assert metadane widoczne (nazwa pliku, rozmiar)
5. Esc → assert slideover zamknięty

---

## Kryteria akceptacji (z ticketu)

- [ ] Klik w wiersz dokumentu otwiera boczny panel (slideover)
- [ ] Obsługiwane formaty: PDF, DOCX, Markdown, TXT/CSV, Obrazy
- [ ] Nieobsługiwane typy: placeholder + przycisk pobierania
- [ ] Panel metadanych: nazwa, rozmiar, typ, data, właściciel, status, folder, uprawnienia
- [ ] Akcje: Pobierz, Usuń (z potwierdzeniem), Udostępnij, Przenieś
- [ ] Klawiatura: Esc zamyka, ←/→ przełącza dokumenty
- [ ] Lazy load — treść ładowana po otwarciu
- [ ] PDF: paginacja + zoom w toolbarze
- [ ] Guard uprawnień przez scope organizationId w endpoincie
- [ ] Testy Vitest + Playwright smoke
- [ ] `npx vitest run` i `npm run lint` przechodzą
