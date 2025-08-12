'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Textarea } from '@ragenai/common-ui';
import { ProjectMentionDropdown } from './ProjectMentionDropdown';
import { validateTextFile } from '@/app/lib/utils/fileValidation';
import { ThreadDocumentUI } from '@/app/contracts/ThreadDocument';
import type { ComponentPropsWithRef } from 'react';

export interface MentionedProject {
  publicId: string;
  title: string;
  id?: number;
}

interface MentionTextareaProps extends ComponentPropsWithRef<typeof Textarea> {
  onProjectMention?: (project: MentionedProject | null) => void;
  mentionedProject?: MentionedProject | null;
}

export const MentionTextarea: React.FC<MentionTextareaProps> = ({
  onProjectMention,
  mentionedProject,
  value = '',
  onChange,
  ...textareaProps
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const [threadDocuments, setThreadDocuments] = useState<ThreadDocumentUI[]>(
    []
  );
  const mentionStartRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      const cursorPos = e.target.selectionStart ?? 0;

      onChange?.(e);

      setCursorPosition(cursorPos);

      const textBeforeCursor = newValue.slice(0, cursorPos);
      const mentionMatch = textBeforeCursor.match(/@([^@\s]*?)$/);

      if (mentionMatch) {
        setMentionQuery(mentionMatch[1]);
        setShowDropdown(true);
        mentionStartRef.current = textBeforeCursor.lastIndexOf('@');
      } else {
        setShowDropdown(false);
        setMentionQuery('');
        mentionStartRef.current = null;
      }

      if (
        mentionedProject &&
        !newValue.includes(`@${mentionedProject.title}`)
      ) {
        onProjectMention?.(null);
      }
    },
    [onChange, mentionedProject, onProjectMention]
  );

  const handleProjectSelect = useCallback(
    (project: MentionedProject) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const currentValue = textarea.value;
      let currentCursorPos = textarea.selectionStart ?? cursorPosition;
      if (currentCursorPos === 0 && cursorPosition > 0) {
        currentCursorPos = cursorPosition;
      }

      const mentionStartIndex = mentionStartRef.current;
      if (mentionStartIndex === null) return;

      const mentionEndIndex = mentionStartIndex + 1 + mentionQuery.length;

      const newValue =
        currentValue.slice(0, mentionStartIndex) +
        `@${project.title}` +
        currentValue.slice(mentionEndIndex);
      const newCursorPos = mentionStartIndex + project.title.length + 1;

      const syntheticEvent = {
        target: { ...textarea, value: newValue },
        currentTarget: { ...textarea, value: newValue },
      } as unknown as React.ChangeEvent<HTMLTextAreaElement>;

      onChange?.(syntheticEvent);

      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        setCursorPosition(newCursorPos);
      });

      onProjectMention?.(project);
      setShowDropdown(false);
      setMentionQuery('');
    },
    [cursorPosition, onChange, onProjectMention, mentionQuery]
  );

  // File handling
  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          resolve(event.target.result as string);
        } else {
          reject(new Error('Failed to read file content'));
        }
      };
      reader.onerror = () =>
        reject(new Error(`Failed to read file: ${file.name}`));
      reader.readAsText(file, 'UTF-8');
    });
  };

  const handleFilesDrop = useCallback(async (files: File[]) => {
    const validFiles: File[] = [];

    for (const file of files) {
      const validation = validateTextFile(file);
      if (validation.valid) {
        validFiles.push(file);
      } else {
        // TODO: Show error toast with validation.error
      }
    }

    // Read file contents
    const newDocuments: ThreadDocumentUI[] = [];
    for (const file of validFiles) {
      try {
        const content = await readFileAsText(file);
        newDocuments.push({
          name: file.name,
          content: content.trim(),
          size: file.size,
          type: file.type || 'text/plain',
        });
      } catch (error) {
        // TODO: Show error toast for file read error
      }
    }

    setThreadDocuments((prev) => [...prev, ...newDocuments]);
  }, []);

  const handleThreadDocumentRemove = useCallback((index: number) => {
    setThreadDocuments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (showDropdown) {
        if (e.key === 'Escape') {
          setShowDropdown(false);
          setMentionQuery('');
          e.preventDefault();
          return;
        }

        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          return;
        }
      }

      textareaProps.onKeyDown?.(e);
    },
    [showDropdown, textareaProps]
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (textareaRef.current?.contains(target)) return;
      if (target.closest('[data-project-dropdown]')) return;
      setShowDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative">
      <Textarea
        {...textareaProps}
        ref={textareaRef}
        value={value}
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
        showFileAttachment={true}
        onFilesDrop={handleFilesDrop}
        threadDocuments={threadDocuments}
        onThreadDocumentRemove={handleThreadDocumentRemove}
      />

      {showDropdown && (
        <ProjectMentionDropdown
          query={mentionQuery}
          onSelect={handleProjectSelect}
          onClose={() => {
            setShowDropdown(false);
            setMentionQuery('');
          }}
        />
      )}
    </div>
  );
};
