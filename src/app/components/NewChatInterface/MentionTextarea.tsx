'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Textarea } from '@ragenai/common-ui';
import { ProjectMentionDropdown } from './ProjectMentionDropdown';
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Handle text change and detect @ mentions
  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      const cursorPos = e.target.selectionStart || 0;

      // Call original onChange if provided
      onChange?.(e);

      setCursorPosition(cursorPos);

      // Check for @ mention at cursor position
      const textBeforeCursor = newValue.slice(0, cursorPos);
      const mentionMatch = textBeforeCursor.match(/@([^@\s]*?)$/);

      if (mentionMatch) {
        setMentionQuery(mentionMatch[1]);
        setShowDropdown(true);
      } else {
        setShowDropdown(false);
        setMentionQuery('');
      }

      // Check if mentioned project was removed from text
      if (
        mentionedProject &&
        !newValue.includes(`@${mentionedProject.title}`)
      ) {
        onProjectMention?.(null);
      }
    },
    [onChange, mentionedProject, onProjectMention]
  );

  // Handle project selection from dropdown
  const handleProjectSelect = useCallback(
    (project: MentionedProject) => {
      if (!textareaRef.current) return;

      const textarea = textareaRef.current;
      const currentValue = textarea.value;

      // Find the @ position before cursor
      const textBeforeCursor = currentValue.slice(0, cursorPosition);
      const mentionStartIndex = textBeforeCursor.lastIndexOf('@');

      if (mentionStartIndex !== -1) {
        // Replace the @query with @projectTitle
        const textAfterCursor = currentValue.slice(cursorPosition);
        const newValue =
          currentValue.slice(0, mentionStartIndex) +
          `@${project.title}` +
          textAfterCursor;

        // Update the actual textarea value first
        textarea.value = newValue;

        // Create synthetic event to trigger onChange
        const syntheticEvent = {
          target: textarea,
          currentTarget: textarea,
        } as React.ChangeEvent<HTMLTextAreaElement>;

        onChange?.(syntheticEvent);

        // Update cursor position after the mention
        const newCursorPos = mentionStartIndex + project.title.length + 1;
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(newCursorPos, newCursorPos);
        }, 0);

        onProjectMention?.(project);
      }

      setShowDropdown(false);
      setMentionQuery('');
    },
    [cursorPosition, onChange, onProjectMention]
  );

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (showDropdown) {
        if (e.key === 'Escape') {
          setShowDropdown(false);
          setMentionQuery('');
          e.preventDefault();
        }
        // Let the dropdown handle other navigation keys
      }

      // Call original onKeyDown if provided
      textareaProps.onKeyDown?.(e);
    },
    [showDropdown, textareaProps.onKeyDown]
  );

  // Handle clicks outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        textareaRef.current &&
        !textareaRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="relative">
      <Textarea
        {...textareaProps}
        ref={textareaRef}
        value={value}
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
      />

      {showDropdown && (
        <ProjectMentionDropdown
          query={mentionQuery}
          onSelect={handleProjectSelect}
          onClose={() => setShowDropdown(false)}
        />
      )}
    </div>
  );
};
