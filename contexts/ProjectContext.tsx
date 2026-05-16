// Copyright (c) 2026 Kunetz Szabolcs. All rights reserved.
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { projectsApi, Project } from '@/utils/api';
import { useAuth } from '@/contexts/AuthContext';

const ACTIVE_PROJECT_KEY = '@childcosts_active_project_id';

type ProjectContextType = {
  projects: Project[];
  activeProject: Project | null;
  activeProjectId: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setActiveProjectId: (id: string) => Promise<void>;
  createProject: (name: string) => Promise<Project>;
  renameProject: (id: string, name: string) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
};

const ProjectContext = createContext<ProjectContextType | null>(null);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const { user, localUserId } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const persistActiveId = async (id: string | null) => {
    try {
      if (id) {
        await AsyncStorage.setItem(ACTIVE_PROJECT_KEY, id);
      } else {
        await AsyncStorage.removeItem(ACTIVE_PROJECT_KEY);
      }
    } catch (e) {
      console.warn('[ProjectContext] Failed to persist active project id', e);
    }
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await projectsApi.getAll();
      setProjects(list);

      const storedId = await AsyncStorage.getItem(ACTIVE_PROJECT_KEY);
      let nextActive: string | null = null;

      if (storedId && list.some((p) => p.id === storedId)) {
        nextActive = storedId;
      } else if (list.length > 0) {
        nextActive = list[0].id;
        await persistActiveId(nextActive);
      } else {
        // No projects exist yet — create a default "Marci" so the user has something to start with
        try {
          const creatorId = user?.id || localUserId || null;
          const created = await projectsApi.create('Marci', creatorId);
          setProjects([created]);
          nextActive = created.id;
          await persistActiveId(nextActive);
        } catch (e: any) {
          console.warn('[ProjectContext] Could not create default project:', e?.message);
        }
      }
      setActiveProjectIdState(nextActive);
    } catch (e: any) {
      console.error('[ProjectContext] Failed to load projects:', e);
      setError(e?.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [user?.id, localUserId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setActiveProjectId = useCallback(async (id: string) => {
    setActiveProjectIdState(id);
    await persistActiveId(id);
  }, []);

  const createProject = useCallback(
    async (name: string) => {
      const creatorId = user?.id || localUserId || null;
      const created = await projectsApi.create(name, creatorId);
      setProjects((prev) => [...prev, created]);
      await setActiveProjectId(created.id);
      return created;
    },
    [user?.id, localUserId, setActiveProjectId]
  );

  const renameProject = useCallback(async (id: string, name: string) => {
    const updated = await projectsApi.rename(id, name);
    setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
    return updated;
  }, []);

  const deleteProject = useCallback(
    async (id: string) => {
      await projectsApi.delete(id);
      setProjects((prev) => {
        const remaining = prev.filter((p) => p.id !== id);
        if (activeProjectId === id) {
          const next = remaining[0]?.id || null;
          setActiveProjectIdState(next);
          persistActiveId(next);
        }
        return remaining;
      });
    },
    [activeProjectId]
  );

  const activeProject = projects.find((p) => p.id === activeProjectId) || null;

  return (
    <ProjectContext.Provider
      value={{
        projects,
        activeProject,
        activeProjectId,
        loading,
        error,
        refresh,
        setActiveProjectId,
        createProject,
        renameProject,
        deleteProject,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export const useProject = () => {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within a ProjectProvider');
  return ctx;
};
