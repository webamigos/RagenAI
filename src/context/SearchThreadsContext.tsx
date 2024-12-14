'use client';

import React, { createContext } from 'react';
import { useModalWithEscapeAndOutsideClick } from '@/app/hooks/useModalWithEscapeAndOutsideClick';

export type SearchThreadsContextType = {
  isSearchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  modalRef: React.RefObject<HTMLDivElement>;
};

export const SearchThreadsContext = createContext<
  SearchThreadsContextType | undefined
>(undefined);

export const SearchThreadsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { isOpen, openModal, closeModal, modalRef } =
    useModalWithEscapeAndOutsideClick<HTMLDivElement>();

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
