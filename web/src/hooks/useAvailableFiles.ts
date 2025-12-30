'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { MentionableFile } from '@/lib/types';

/**
 * Shared hook for building available files for @ mentions.
 * Used by both ChatView and ChatPanel for consistent file references.
 *
 * Asset 归属统一: 所有文件统一归属于 Folder
 * - Folder.inputs: 用户上传的输入文件
 * - Folder.outputs: 系统生成的结构文件
 */
export function useAvailableFiles(): MentionableFile[] {
  const { folders, activeTask } = useAppStore();

  return useMemo(() => {
    const files: MentionableFile[] = [];

    // Add files from all folders (with folder path for disambiguation)
    // Asset 统一归属于 Folder.inputs 和 Folder.outputs
    folders.forEach((folder) => {
      // Add input files (sequences)
      folder.inputs.forEach((input) => {
        files.push({
          id: `${folder.id}/${input.name}`,
          name: input.name,
          path: `${folder.name}/${input.name}`,
          type: input.type,
          source: 'project',
        });
      });

      // Add output files (structures)
      folder.outputs.forEach((output) => {
        files.push({
          id: `${folder.id}/outputs/${output.filename}`,
          name: output.filename,
          path: `${folder.name}/outputs/${output.filename}`,
          type: 'structure',
          source: 'project',
        });
      });
    });

    // Add files from activeTask (real-time streaming artifacts not yet in folder)
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

    return files;
  }, [folders, activeTask]);
}
