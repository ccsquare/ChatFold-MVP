'use client';

import { useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { StepEvent, Job } from '@/lib/types';
import { getBackendUrl } from '@/config';

/**
 * Shared hook for managing protein folding jobs with SSE streaming.
 * Used by both ChatView and ChatPanel for unified API access.
 */
export function useFoldingJob() {
  const {
    setActiveJob,
    addStepEvent,
    activeJob,
    isStreaming,
    createFolder,
    addFolderInput,
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
   * Start SSE streaming for a job
   * Note: SSE connects directly to Python backend to avoid Next.js proxy buffering
   */
  const startStream = useCallback(
    (jobId: string, sequence: string) => {
      // Close any existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      // Connect directly to Python backend for SSE (bypasses Next.js proxy buffering)
      const eventSource = new EventSource(
        `${getBackendUrl()}/api/v1/jobs/${jobId}/stream?sequence=${encodeURIComponent(sequence)}`
      );
      eventSourceRef.current = eventSource;

      eventSource.addEventListener('step', (event) => {
        const stepEvent: StepEvent = JSON.parse(event.data);
        addStepEvent(jobId, stepEvent);
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
   * @param conversationId - The conversation ID to associate with the job
   * @param sequence - The protein sequence to fold
   * @param options - Additional options
   * @returns The created job or null if failed
   */
  const submit = useCallback(
    async (
      conversationId: string,
      sequence: string,
      options?: {
        filename?: string;
        fastaContent?: string;
      }
    ): Promise<{ job: Job; folderId: string } | null> => {
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

        // Create job via API
        const response = await fetch('/api/v1/jobs', {
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
            errorData.details?.join(', ') || errorData.error || 'Failed to create job'
          );
        }

        const { job } = await response.json();

        // Set active job and start streaming
        setActiveJob({ ...job, status: 'running' });
        startStream(job.id, sequence);

        return { job, folderId };
      } catch (error) {
        console.error('Failed to submit folding job:', error);
        return null;
      }
    },
    [createFolder, addFolderInput, setActiveJob, startStream]
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
   * Cancel the current streaming job
   * @returns true if cancellation was initiated successfully
   */
  const cancel = useCallback(async (): Promise<boolean> => {
    const currentJob = activeJob;
    if (!currentJob || !eventSourceRef.current) {
      return false;
    }

    try {
      // 1. Close the SSE connection immediately
      eventSourceRef.current.close();
      eventSourceRef.current = null;

      // 2. Call backend cancel API
      const response = await fetch(`${getBackendUrl()}/api/v1/jobs/${currentJob.id}/cancel`, {
        method: 'POST',
      });

      if (!response.ok) {
        console.error('Failed to cancel job on backend');
      }

      // 3. Update local state regardless of backend response
      setActiveJob({
        ...currentJob,
        status: 'canceled',
      });

      return true;
    } catch (error) {
      console.error('Error canceling job:', error);
      // Still update local state for optimistic UI
      setActiveJob({
        ...currentJob,
        status: 'canceled',
      });
      return false;
    }
  }, [activeJob, setActiveJob]);

  return {
    submit,
    cancel,
    cleanup,
    startStream,
    job: activeJob,
    steps: activeJob?.steps || [],
    artifacts: activeJob?.structures || [],
    isStreaming,
  };
}
