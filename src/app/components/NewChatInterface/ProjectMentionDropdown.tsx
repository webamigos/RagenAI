'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/app/hooks/use-auth';
import { FolderIcon } from '@heroicons/react/20/solid';
import { getUserProjectsQuery as fetchProjectsForUser } from '@/features/projects/services/queries/get-user-projects-query';
import type { MentionedProject } from './MentionTextarea';

interface Project {
  id: number;
  publicId: string;
  title: string;
  createdAt: string;
  organizationId: string | null;
}

interface ProjectMentionDropdownProps {
  query: string;
  onSelect: (project: MentionedProject) => void;
  onClose: () => void;
}

export const ProjectMentionDropdown: React.FC<ProjectMentionDropdownProps> = ({
  query,
  onSelect,
  onClose,
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { orgId, userId } = useAuth();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadProjects = async () => {
      if (!orgId || !userId) {
        return;
      }

      try {
        setLoading(true);
        const userProjects = await fetchProjectsForUser(orgId, userId);
        setProjects(userProjects);
      } catch (error) {
        setProjects([]);
      } finally {
        setLoading(false);
      }
    };

    loadProjects();
  }, [orgId, userId]);

  const filteredProjects = projects.filter((project) =>
    project.title.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredProjects.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filteredProjects.length === 0) {
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < filteredProjects.length - 1 ? prev + 1 : 0,
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredProjects.length - 1,
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredProjects[selectedIndex]) {
            onSelect({
              id: filteredProjects[selectedIndex].id,
              publicId: filteredProjects[selectedIndex].publicId,
              title: filteredProjects[selectedIndex].title,
            });
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [filteredProjects, selectedIndex, onSelect, onClose]);

  useEffect(() => {
    if (dropdownRef.current) {
      const selectedElement = dropdownRef.current.children[
        selectedIndex
      ] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth',
        });
      }
    }
  }, [selectedIndex]);

  if (loading) {
    return (
      <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 z-50">
        <div className="p-3 text-center text-sm text-gray-500 dark:text-gray-400">
          Loading projects...
        </div>
      </div>
    );
  }

  if (filteredProjects.length === 0) {
    return (
      <div
        data-project-dropdown
        className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 z-50"
      >
        <div className="p-3 text-center text-sm text-gray-500 dark:text-gray-400">
          {query
            ? `No projects found matching "${query}"`
            : 'No projects available'}
        </div>
      </div>
    );
  }

  return (
    <div
      data-project-dropdown
      ref={dropdownRef}
      className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 z-50 max-h-48 overflow-y-auto"
    >
      {filteredProjects.map((project, index) => (
        <button
          key={project.publicId}
          type="button"
          className={`w-full flex items-center px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 focus:bg-gray-50 dark:focus:bg-gray-700 focus:outline-none ${
            index === selectedIndex ? 'bg-gray-50 dark:bg-gray-700' : ''
          } ${index === 0 ? 'rounded-t-md' : ''} ${
            index === filteredProjects.length - 1 ? 'rounded-b-md' : ''
          }`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSelect({
              id: project.id,
              publicId: project.publicId,
              title: project.title,
            });
          }}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <FolderIcon className="h-4 w-4 text-gray-400 dark:text-gray-500 mr-2 flex-shrink-0" />
          <span className="text-sm text-gray-900 dark:text-gray-100 truncate">
            {project.title}
          </span>
        </button>
      ))}
    </div>
  );
};
