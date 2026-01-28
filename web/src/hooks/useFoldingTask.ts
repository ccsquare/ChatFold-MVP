'use client';

import { useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { StepEvent, Task } from '@/lib/types';
import { getBackendUrl } from '@/config';
import { api, getAuthenticatedUrl } from '@/lib/api/client';

/**
 * Shared hook for managing protein folding tasks with SSE streaming.
 * Used by both ChatView and ChatPanel for unified API access.
 */
export function useFoldingTask() {
  const {
    setActiveTask,
    addStepEvent,
    activeTask,
    isStreaming,
    createFolder,
    addFolderInput,
    setIsStreaming,
    setStreamError,
  } = useAppStore();

  const eventSourceRef = useRef<EventSource | null>(null);

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  /**
   * Start SSE streaming for a task
   * Note: SSE connects directly to Python backend to avoid Next.js proxy buffering
   */
  const startStream = useCallback(
    (taskId: string, sequence: string, query?: string) => {
      // Close any existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      // Connect directly to Python backend for SSE (bypasses Next.js proxy buffering)
      // Use getAuthenticatedUrl to include token for SSE authentication
      const params: Record<string, string> = { sequence };
      if (query) {
        params.query = query;
      }
      const sseUrl = getAuthenticatedUrl(`/api/v1/tasks/${taskId}/stream`, params);
      const eventSource = new EventSource(sseUrl);
      eventSourceRef.current = eventSource;

      eventSource.addEventListener('step', (event) => {
        const stepEvent: StepEvent = JSON.parse(event.data);
        addStepEvent(taskId, stepEvent);
      });

      eventSource.addEventListener('done', () => {
        eventSource.close();
        eventSourceRef.current = null;
      });

      eventSource.addEventListener('canceled', () => {
        eventSource.close();
        eventSourceRef.current = null;
      });

      eventSource.onerror = () => {
        eventSource.close();
        eventSourceRef.current = null;

        // Check if the task completed normally before the connection dropped.
        // If still running, this is an unexpected disconnect (e.g. nginx timeout).
        const { activeTask: currentTask } = useAppStore.getState();
        if (currentTask && currentTask.status === 'running') {
          setStreamError('timeout');
          setIsStreaming(false);
        }
      };
    },
    [addStepEvent, setIsStreaming, setStreamError]
  );

  /**
   * Submit a sequence for folding
   * @param conversationId - The conversation ID to associate with the task
   * @param sequence - The protein sequence to fold
   * @param options - Additional options
   * @returns The created task or null if failed
   */
  const submit = useCallback(
    async (
      conversationId: string,
      sequence: string,
      options?: {
        filename?: string;
        fastaContent?: string;
        query?: string;
      }
    ): Promise<{ task: Task; folderId: string } | null> => {
      try {
        // Get fresh activeFolderId from store to avoid stale closure
        const freshActiveFolderId = useAppStore.getState().activeFolderId;
        let folderId = freshActiveFolderId;
        if (!folderId) {
          folderId = createFolder();
        }

        // Add input file to folder if provided
        if (options?.filename && options?.fastaContent) {
          addFolderInput(folderId, {
            name: options.filename,
            type: 'fasta',
            content: options.fastaContent,
          });
        }

        // Create task via API with auth token
        const { task } = await api.post<{ task: Task }>('/tasks', {
          conversationId,
          sequence,
        });

        // Set active task and start streaming
        setActiveTask({ ...task, status: 'running' });
        startStream(task.id, sequence, options?.query);

        return { task, folderId };
      } catch (error) {
        console.error('Failed to submit folding task:', error);
        return null;
      }
    },
    [createFolder, addFolderInput, setActiveTask, startStream]
  );

  /**
   * Cleanup/cancel the current stream
   */
  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  /**
   * Cancel the current streaming task
   * @returns true if cancellation was initiated successfully
   */
  const cancel = useCallback(async (): Promise<boolean> => {
    const currentTask = activeTask;
    if (!currentTask || !eventSourceRef.current) {
      return false;
    }

    try {
      // 1. Close the SSE connection immediately
      eventSourceRef.current.close();
      eventSourceRef.current = null;

      // 2. Call backend cancel API with auth token
      try {
        await api.post(`/tasks/${currentTask.id}/cancel`);
      } catch (error) {
        console.error('Failed to cancel task on backend:', error);
      }

      // 3. Update local state regardless of backend response
      setActiveTask({
        ...currentTask,
        status: 'canceled',
      });

      return true;
    } catch (error) {
      console.error('Error canceling task:', error);
      // Still update local state for optimistic UI
      setActiveTask({
        ...currentTask,
        status: 'canceled',
      });
      return false;
    }
  }, [activeTask, setActiveTask]);

  return {
    submit,
    cancel,
    cleanup,
    startStream,
    task: activeTask,
    steps: activeTask?.steps || [],
    artifacts: activeTask?.structures || [],
    isStreaming,
  };
}
