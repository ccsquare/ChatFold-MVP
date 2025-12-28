'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Camera snapshot type matching Mol*'s camera state
 */
export interface CameraSnapshot {
  mode: string;
  position: [number, number, number];
  up: [number, number, number];
  target: [number, number, number];
  radius: number;
  radiusMax: number;
  fog: number;
  clipFar: boolean;
  minNear: number;
  fov: number;
}

/**
 * Camera sync event payload
 */
export interface CameraSyncEvent {
  syncGroupId: string;
  sourceViewerId: string;
  snapshot: CameraSnapshot;
}

// Global event target for camera sync communication
const cameraSyncEventTarget = new EventTarget();

// Track which viewers are currently being interacted with
const activeInteractions = new Set<string>();

// Debug mode - set to true to see camera sync logs in console
const DEBUG = false;
const log = (...args: any[]) => DEBUG && console.log('[CameraSync]', ...args);

/**
 * Hook for synchronizing camera state across multiple Mol* viewers.
 */
export function useCameraSync(
  viewerId: string,
  syncGroupId: string | null,
  enabled: boolean,
  pluginRef: React.RefObject<any>
) {
  const isReceivingRef = useRef(false);
  const lastSnapshotRef = useRef<string | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const isInteractingRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);

  // Broadcast camera changes to other viewers in the same sync group
  const broadcastCameraChange = useCallback((snapshot: CameraSnapshot) => {
    if (!syncGroupId || !enabled) return;
    if (isReceivingRef.current) return;

    // Skip if snapshot hasn't changed
    const snapshotString = JSON.stringify(snapshot);
    if (snapshotString === lastSnapshotRef.current) return;
    lastSnapshotRef.current = snapshotString;

    log('Broadcasting from', viewerId);

    const event = new CustomEvent<CameraSyncEvent>('camera-sync', {
      detail: {
        syncGroupId,
        sourceViewerId: viewerId,
        snapshot,
      },
    });
    cameraSyncEventTarget.dispatchEvent(event);
  }, [syncGroupId, enabled, viewerId]);

  // Check for canvas availability
  useEffect(() => {
    if (!syncGroupId || !enabled) {
      setCanvasReady(false);
      return;
    }

    let attempts = 0;
    const maxAttempts = 50; // 5 seconds

    const checkCanvas = () => {
      const plugin = pluginRef.current;
      const canvas = plugin?.canvas3d?.webgl?.gl?.canvas;

      if (canvas) {
        log('Canvas ready for', viewerId);
        setCanvasReady(true);
        return;
      }

      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(checkCanvas, 100);
      }
    };

    checkCanvas();

    return () => {
      setCanvasReady(false);
    };
  }, [syncGroupId, enabled, pluginRef, viewerId]);

  // Handle incoming camera sync events
  useEffect(() => {
    if (!syncGroupId || !enabled) return;

    const handleCameraSync = (event: Event) => {
      const customEvent = event as CustomEvent<CameraSyncEvent>;
      const { syncGroupId: eventGroupId, sourceViewerId, snapshot } = customEvent.detail;

      // Ignore events from self or different groups
      if (sourceViewerId === viewerId || eventGroupId !== syncGroupId) return;

      const plugin = pluginRef.current;
      if (!plugin?.canvas3d?.camera) {
        log('No camera for', viewerId);
        return;
      }

      // Mark as receiving to prevent feedback loop
      isReceivingRef.current = true;

      log('Receiving at', viewerId, 'from', sourceViewerId);

      try {
        // Apply the camera snapshot using Mol*'s camera API
        const camera = plugin.canvas3d.camera;
        camera.setState(snapshot, 0);
        plugin.canvas3d.requestDraw(true);
      } catch (e) {
        console.warn('Failed to apply camera sync:', e);
      }

      // Reset receiving flag after a short delay
      requestAnimationFrame(() => {
        setTimeout(() => {
          isReceivingRef.current = false;
        }, 32);
      });
    };

    cameraSyncEventTarget.addEventListener('camera-sync', handleCameraSync);

    return () => {
      cameraSyncEventTarget.removeEventListener('camera-sync', handleCameraSync);
    };
  }, [syncGroupId, enabled, viewerId, pluginRef]);

  // Monitor camera changes during interaction using pointer events + RAF polling
  useEffect(() => {
    // Clean up previous listeners if any
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    if (!syncGroupId || !enabled || !canvasReady) return;

    const plugin = pluginRef.current;
    if (!plugin?.canvas3d) return;

    // Find the canvas element
    const canvas = plugin.canvas3d.webgl?.gl?.canvas as HTMLCanvasElement | undefined;
    if (!canvas) {
      log('No canvas element for', viewerId);
      return;
    }

    log('Setting up listeners for', viewerId);

    let lastSnapshot: string | null = null;

    const pollCamera = () => {
      if (!isInteractingRef.current) {
        rafIdRef.current = null;
        return;
      }

      const currentPlugin = pluginRef.current;
      const camera = currentPlugin?.canvas3d?.camera;
      if (camera && !isReceivingRef.current) {
        try {
          const snapshot = camera.getSnapshot();
          const snapshotStr = JSON.stringify(snapshot);

          if (snapshotStr !== lastSnapshot) {
            lastSnapshot = snapshotStr;
            broadcastCameraChange(snapshot);
          }
        } catch (e) {
          // Ignore errors
        }
      }

      rafIdRef.current = requestAnimationFrame(pollCamera);
    };

    const handlePointerDown = (e: PointerEvent) => {
      // Only track left mouse button or touch
      if (e.button !== 0 && e.pointerType === 'mouse') return;

      log('Pointer down on', viewerId);
      isInteractingRef.current = true;
      activeInteractions.add(viewerId);

      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(pollCamera);
      }
    };

    const handlePointerUp = () => {
      if (!isInteractingRef.current) return;

      log('Pointer up on', viewerId);
      isInteractingRef.current = false;
      activeInteractions.delete(viewerId);

      // Send final snapshot
      const currentPlugin = pluginRef.current;
      const camera = currentPlugin?.canvas3d?.camera;
      if (camera && !isReceivingRef.current) {
        try {
          const snapshot = camera.getSnapshot();
          broadcastCameraChange(snapshot);
        } catch (e) {
          // Ignore
        }
      }
    };

    const handlePointerLeave = () => {
      if (isInteractingRef.current) {
        handlePointerUp();
      }
    };

    // Handle wheel events for zoom sync
    const handleWheel = () => {
      if (isReceivingRef.current) return;

      // Debounce wheel events
      setTimeout(() => {
        const currentPlugin = pluginRef.current;
        const camera = currentPlugin?.canvas3d?.camera;
        if (camera) {
          try {
            const snapshot = camera.getSnapshot();
            broadcastCameraChange(snapshot);
          } catch (e) {
            // Ignore
          }
        }
      }, 50);
    };

    // Use capture phase to ensure we get the events before Mol*
    canvas.addEventListener('pointerdown', handlePointerDown, { capture: true });
    window.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointerleave', handlePointerLeave);
    canvas.addEventListener('pointercancel', handlePointerUp);
    canvas.addEventListener('wheel', handleWheel, { passive: true, capture: true });

    cleanupRef.current = () => {
      canvas.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      window.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      canvas.removeEventListener('pointercancel', handlePointerUp);
      canvas.removeEventListener('wheel', handleWheel);

      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

      activeInteractions.delete(viewerId);
    };

    return cleanupRef.current;
  }, [syncGroupId, enabled, viewerId, pluginRef, broadcastCameraChange, canvasReady]);

  return {
    broadcastCameraChange,
    isReceiving: isReceivingRef.current,
  };
}

/**
 * Reset all viewers in a sync group to the same camera state
 */
export function resetSyncGroupCamera(syncGroupId: string) {
  const event = new CustomEvent('camera-sync-reset', {
    detail: { syncGroupId },
  });
  cameraSyncEventTarget.dispatchEvent(event);
}

/**
 * Hook for handling sync group camera reset
 */
export function useCameraSyncReset(
  syncGroupId: string | null,
  onReset: () => void
) {
  useEffect(() => {
    if (!syncGroupId) return;

    const handleReset = (event: Event) => {
      const customEvent = event as CustomEvent<{ syncGroupId: string }>;
      if (customEvent.detail.syncGroupId === syncGroupId) {
        onReset();
      }
    };

    cameraSyncEventTarget.addEventListener('camera-sync-reset', handleReset);

    return () => {
      cameraSyncEventTarget.removeEventListener('camera-sync-reset', handleReset);
    };
  }, [syncGroupId, onReset]);
}
