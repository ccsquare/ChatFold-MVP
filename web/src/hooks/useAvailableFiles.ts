'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { MentionableFile } from '@/lib/types';
import { useConversationTimeline } from './useConversationTimeline';

/**
 * Shared hook for building available files for @ mentions.
 * Used by both ChatView and ChatPanel for consistent file references.
 */
export function useAvailableFiles(): MentionableFile[] {
  const { projects, activeTask } = useAppStore();
  const { conversation } = useConversationTimeline();

  return useMemo(() => {
    const files: MentionableFile[] = [];

    // Add files from all projects (with project path for disambiguation)
    projects.forEach((project) => {
      // Add input files (sequences)
      project.inputs.forEach((input) => {
        files.push({
          id: `${project.id}/${input.name}`,
          name: input.name,
          path: `${project.name}/${input.name}`,
          type: input.type,
          source: 'project',
        });
      });

      // Add output files (structures)
      project.outputs.forEach((output) => {
        files.push({
          id: `${project.id}/outputs/${output.filename}`,
          name: output.filename,
          path: `${project.name}/outputs/${output.filename}`,
          type: 'structure',
          source: 'project',
        });
      });
    });

    // Add files from activeTask
    if (activeTask?.steps) {
      activeTask.steps.forEach((step) => {
        step.artifacts?.forEach((artifact) => {
          const id = `task/${activeTask.id}/${artifact.filename}`;
          if (!files.some((f) => f.id === id)) {
            files.push({
              id,
              name: artifact.filename,
              path: `task/${activeTask.id}/${artifact.filename}`,
              type: 'structure',
              source: 'task',
            });
          }
        });
      });
    }

    // Add assets from active conversation
    if (conversation?.assets) {
      conversation.assets.forEach((asset) => {
        const id = `conversation/${conversation.id}/${asset.name}`;
        if (!files.some((f) => f.id === id)) {
          files.push({
            id,
            name: asset.name,
            path: `conversation/${conversation.id}/${asset.name}`,
            type: asset.type,
            source: 'conversation',
          });
        }
      });
    }

    return files;
  }, [projects, activeTask, conversation]);
}
