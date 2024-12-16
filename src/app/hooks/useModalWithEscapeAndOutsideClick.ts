import { useState, useCallback, useEffect, useRef } from 'react';

export const useModalWithEscapeAndOutsideClick = <T extends HTMLElement>() => {
  const [isOpen, setIsOpen] = useState(false);
  const modalRef = useRef<T | null>(null);

  const openModal = useCallback(() => setIsOpen(true), []);
  const closeModal = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!modalRef.current) {
        return;
      }

      if (!modalRef.current.contains(event.target as Node)) {
        closeModal();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, closeModal]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeModal();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, closeModal]);

  return { isOpen, openModal, closeModal, modalRef };
};
