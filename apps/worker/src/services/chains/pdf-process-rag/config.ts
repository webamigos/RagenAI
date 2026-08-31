export const CHAIN_FINAL_ANSWER_RUN_NAME = 'final_answer';

export const PDF_IMAGE_CONFIG = {
  scale: 3,
  saveFilename: 'page',
};

export const PDF_PROCESSING_CONFIG = {
  batchSize: 10,
  chunkSettings: {
    chunkSize: 1000,
    chunkOverlap: 200,
  },
};

export const availableModels = {
  mini: 'gpt-5.4-mini',
  nano: 'gpt-5.4-nano',
};

export const PDF_MODEL = process.env.PDF_MODEL || 'claude-haiku-4-5';
export const PDF_PROCESSOR = process.env.PDF_PROCESSOR || 'claude';

export const systemTemplates = {
  imageAnalysis: `
  Jesteś ekspertem w analizowaniu plików PDF. Twoim zadaniem jest:
    1. Przepisanie całego widocznego tekstu z dokumentu, zachowując jego oryginalną strukturę, formatowanie i układ.
    2. Opisywanie istotnych dla kontekstu dokumentu elementów graficznych (np. diagramów, ilustracji, wykresów) stosująć poniższe zasady:
    <zasady opisywania elementów graficznych>
      - Wymień wszystkie główne elementy widoczne na obrazie.
      - Teraz opisz szczegółowo każdy z tych elementów.
      - Na koniec, stwórz spójny opis całego obrazu, łącząc wszystkie te informacje.
    </zasady opisywania elementów graficznych>

  <zasady ogólne>
    - Nie ingeruj w treść, nawet jeśli jest ona niekompletna lub niejasna.
    - Jeśli jakiś fragment tekstu jest częściowo widoczny lub niejasny, zaznacz to jako [niejasne] lub podaj najlepszą interpretację w [nawiasach kwadratowych].
    - Równania lub formuły matematyczne przepisz dokładnie jako formuły matematyczne nie jako tekst.
    - Układ przestrzenny treści, np. tabele, listy, podkreślenia, zakreślenia, obwiedzenia, strzałki czy linie łączące poszczególne elementy.
    - Symbole, adnotacje lub specjalne oznaczenia w tekście.
    - Zachowaj spójność podczas opisywania dokumentu, nie rozdzielaj opisów na osobne sekcje.
  </zasady ogólne>
`,
  pdfExtraction: `You are an expert document processor. Extract all content from this PDF document thoroughly and accurately.

For each page:
1. Transcribe all visible text, preserving its original structure (headings, paragraphs, lists, footnotes).
2. Render tables as markdown tables with proper alignment.
3. Describe any charts, diagrams, images, or visual elements in detail — include data points, labels, axes, and trends where visible.
4. Preserve mathematical formulas and equations accurately.
5. Note any annotations, highlights, or handwritten content.

CRITICAL: Your entire output MUST be in the same language as the document. If the document is in Polish, write everything in Polish — including section headers, labels, descriptions, and any structural text you add. Do not translate any content to English. If the document is multilingual, maintain the original languages.
Do not add commentary or interpretation — just extract and describe the content faithfully.`,
  /**
   * Structured-output PDF extraction prompt (ADR-18, Phase 4b).
   *
   * Asks Claude to return a JSON object describing the document as an array
   * of hierarchical sections (heading level + title + body content). Each
   * section becomes a retrieval-grade chunk carrying a `sectionPath` metadata
   * field that travels into the Qdrant payload as `section_path`.
   *
   * Robustness rules:
   *   - Output is STRICT JSON, no markdown code fences, no prose.
   *   - Any content preceding the first heading is emitted as a section
   *     with empty title and level 1, so it isn't lost.
   *   - Language of content stays in the source language (same rule as the
   *     legacy `pdfExtraction` prompt).
   *   - Tables, charts, images are described inside the owning section's
   *     content field — not split out as separate sections.
   *
   * If Claude deviates (wraps in fences, adds prose, omits required keys),
   * the caller's Zod validator rejects the output and the chain falls back
   * to the legacy flat-text `pdfExtraction` prompt result.
   */
  pdfExtractionStructured: `You are a document structure extractor. Extract all content from this PDF and return it as a JSON object with a single top-level key: "sections".

Each element of "sections" is an object with:
- "level": integer 1-6, the heading depth (1 = top-level heading, 2 = subsection, etc.)
- "title": the heading text as it appears in the document (string, can be empty for content before the first heading)
- "content": the body text that appears under this heading, verbatim, preserving paragraph breaks with double newlines. Render tables as markdown tables inside the content. Describe charts, diagrams, images, and visual elements inline within the content. Preserve mathematical formulas accurately. Keep annotations and highlights as inline notes.

Rules:
1. Sections appear in the order they appear in the document.
2. Any text before the first heading is a single section with level 1 and an empty title.
3. Do not invent headings. If the document has no explicit hierarchy, return a single section with level 1 and an appropriate summarizing title (or empty title).
4. Preserve the document's original language in every field. If the document is in Polish, "title" and "content" are in Polish. If multilingual, keep the original languages.
5. Do not add commentary, interpretation, or meta-text about the document. Do not introduce the JSON or explain it.

CRITICAL OUTPUT FORMAT: Respond with a single JSON object and nothing else. No markdown code fences. No prose before or after. No \`\`\`json wrapper. The response must start with { and end with } and must be parseable by JSON.parse directly.`,
} as const;

export const humanTemplates = {
  imageDescription: 'Opisz zawartość obrazu',
  pdfExtraction: 'Extract and describe all content from this PDF document.',
  pdfExtractionStructured:
    'Extract the PDF as a JSON object with a "sections" array. Respond with JSON only, no code fences, no prose.',
} as const;
