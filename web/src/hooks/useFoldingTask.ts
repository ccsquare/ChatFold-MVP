'use client';

import { useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { StepEvent, Task } from '@/lib/types';

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
    activeProjectId,
    createProject,
    addProjectInput,
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
    (taskId: string, sequence: string) => {
      // Close any existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      // Connect directly to Python backend for SSE (bypasses Next.js proxy buffering)
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
      const eventSource = new EventSource(
        `${backendUrl}/api/v1/tasks/${taskId}/stream?sequence=${encodeURIComponent(sequence)}`
      );
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
      };
    },
    [addStepEvent]
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
      }
    ): Promise<{ task: Task; projectId: string } | null> => {
      try {
        // Create or get active project
        let projId = activeProjectId;
        if (!projId) {
          projId = createProject();
        }

        // Add input file to project if provided
        if (options?.filename && options?.fastaContent) {
          addProjectInput(projId, {
            name: options.filename,
            type: 'fasta',
            content: options.fastaContent,
          });
        }

        // Create task via API
        const response = await fetch('/api/v1/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId,
            sequence,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.details?.join(', ') || errorData.error || 'Failed to create task'
          );
        }

        const { task } = await response.json();

        // Set active task and start streaming
        setActiveTask({ ...task, status: 'running' });
        startStream(task.id, sequence);

        return { task, projectId: projId };
      } catch (error) {
        console.error('Failed to submit folding task:', error);
        return null;
      }
    },
    [activeProjectId, createProject, addProjectInput, setActiveTask, startStream]
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

      // 2. Call backend cancel API
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
      const response = await fetch(`${backendUrl}/api/v1/tasks/${currentTask.id}/cancel`, {
        method: 'POST',
      });

      if (!response.ok) {
        console.error('Failed to cancel task on backend');
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
