'use client';

import React, { createContext } from 'react';
import { useModalWithEscapeAndOutsideClick } from '@/app/hooks/useModalWithEscapeAndOutsideClick';
import { useSearchShortcut } from '@/app/hooks/useSearchShortcut';

export type SearchThreadsContextType = {
  isSearchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  modalRef: React.RefObject<HTMLDivElement | null>;
};

export const SearchThreadsContext = createContext<
  SearchThreadsContextType | undefined
>(undefined);

export const SearchThreadsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { isOpen, openModal, closeModal, modalRef } =
    useModalWithEscapeAndOutsideClick<HTMLDivElement>();

  // Here rather than on the sidebar button: the chord has to work from the
  // composer, from a settings page and while the sidebar is collapsed.
  useSearchShortcut({ isOpen, open: openModal, close: closeModal });

  return (
    <SearchThreadsContext.Provider
      value={{
        isSearchOpen: isOpen,
        openSearch: openModal,
        closeSearch: closeModal,
        modalRef,
      }}
    >
      {children}
    </SearchThreadsContext.Provider>
  );
};
