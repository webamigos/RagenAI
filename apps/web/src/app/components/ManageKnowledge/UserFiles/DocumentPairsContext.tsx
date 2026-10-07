'use client';

import { createContext, useContext } from 'react';

/**
 * What a row needs to open the language-pair dialog. A context rather than a
 * prop because the row sits four components below the wrapper that owns the
 * dialog, and none of those four has any use for it. `undefined` means "this
 * viewer cannot manage pairs here", and the row shows no menu item.
 */
const DocumentPairsContext = createContext<
  ((fileId: string) => void) | undefined
>(undefined);

export const DocumentPairsProvider = DocumentPairsContext.Provider;

export function useManageDocumentPair() {
  return useContext(DocumentPairsContext);
}
