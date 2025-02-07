'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@ragenai/common-ui';
import { CreateProject } from '@/app/components/ManageKnowledge/Projects/CreateProject';
import { statusToast } from '@/app/lib/utils/toast';

interface Project {
  id: number;
  public_id: string;
  title: string;
  created_at: string;
}

export default function ProjectsPage() {
  const t = useTranslations();
  const { errorToast } = statusToast();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/projects');
      if (!response.ok) {
        throw new Error(t('projects.error.fetch-failed'));
      }
      const data = await response.json();
      setProjects(data);
    } catch (error) {
      errorToast({
        message: t('projects.error.fetch-failed'),
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  return (
    <div className="flex-1 p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">{t('sidebar.projects')}</h1>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          {t('projects.create')}
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center">{t('projects.loading')}</div>
      ) : projects.length === 0 ? (
        <div className="text-center text-muted-foreground">
          {t('projects.no-projects')}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="p-4 border rounded-lg hover:border-primary transition-colors"
            >
              <h3 className="font-medium mb-2">{project.title}</h3>
              <p className="text-sm text-muted-foreground">
                {t('projects.created-at')}{' '}
                {new Date(project.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}

      <CreateProject
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          fetchProjects();
        }}
      />
    </div>
  );
}
