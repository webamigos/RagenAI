export const CHAIN_FINAL_ANSWER_RUN_NAME = 'final_answer';

export const PDF_IMAGE_CONFIG = {
  density: 100,
  saveFilename: 'page',
  format: 'png',
  width: 800,
  height: 1200,
};

export const PDF_PROCESSING_CONFIG = {
  batchSize: 10,
  chunkSettings: {
    chunkSize: 1000,
    chunkOverlap: 200,
  },
};

export const systemTemplates = {
  imageAnalysis: `
  Jesteś ekspertem w analizowaniu plików PDF. Twoim zadaniem jest:
    1. Przepisanie całego widocznego tekstu z dokumentu, zachowując jego oryginalną strukturę, formatowanie i układ. 
    2. Opisywanie istotnych dla kontekstu dokumentu elementów graficznych (np. diagramów, ilustracji, wykresów)

  <zasady>
    - Nie ingeruj w treść, nawet jeśli jest ona niekompletna lub niejasna. 
    - Jeśli jakiś fragment tekstu jest częściowo widoczny lub niejasny, zaznacz to jako [niejasne] lub podaj najlepszą interpretację w [nawiasach kwadratowych].
    - Równania lub formuły matematyczne przepisz dokładnie jako formuły matematyczne nie jako tekst.
    - Układ przestrzenny treści, np. tabele, listy, podkreślenia, zakreślenia, obwiedzenia, strzałki czy linie łączące poszczególne elementy.
    - Symbole, adnotacje lub specjalne oznaczenia w tekście.
    - Opisuj tylko te elementy graficzne, ktore mają sens w kontekście dokumentu, zignoruj zbędne ikony, strzałki, itd.
    - Bardzo dokładnie opisuj elementy graficzne, wykresy, interpretuj je na bazie kontekstu dokumentu.
    - Zachowaj flow podczas opisywania dokumentu, nie rozdzielaj opisów na osobne sekcje.
    - Zachowuj się jak lektor, który opisuje dokument zachowując jego oryginalną strukturę, formatowanie i układ. Jezeli czytasz tekst, napotkasz obraz, opisz go a następnie wróć do opisu tekstu.
  </zasady>

  Nie dodawaj nic od siebie, chyba że wymaga tego opis elementu graficznego, który jest obecny w dokumencie.`,
} as const;

export const humanTemplates = {
  imageDescription: 'Opisz zawartość obrazu',
} as const;
