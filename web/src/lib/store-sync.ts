/**
 * Cross-tab state synchronization for Zustand store.
 *
 * Uses BroadcastChannel API to sync state changes across browser tabs.
 * This prevents issues like:
 * - Duplicate job submissions from different tabs
 * - Stale folder/conversation lists
 * - Inconsistent UI state
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel
 */

import { useAppStore } from './store';
import type { Folder, Conversation, Job } from './types';

// Channel name for ChatFold state sync
const CHANNEL_NAME = 'chatfold-sync';

// Message types for different state updates
type SyncMessageType =
  | 'FOLDERS_UPDATE'
  | 'CONVERSATIONS_UPDATE'
  | 'JOB_UPDATE'
  | 'ACTIVE_FOLDER_CHANGE'
  | 'ACTIVE_CONVERSATION_CHANGE'
  | 'FULL_STATE_REQUEST'
  | 'FULL_STATE_RESPONSE';

interface SyncMessage {
  type: SyncMessageType;
  senderId: string;
  timestamp: number;
  payload?: unknown;
}

interface FoldersUpdatePayload {
  folders: Folder[];
  activeFolderId: string | null;
}

interface ConversationsUpdatePayload {
  conversations: Conversation[];
  activeConversationId: string | null;
}

interface JobUpdatePayload {
  job: Job | null;
  isStreaming: boolean;
}

// Unique ID for this tab instance
const TAB_ID = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

// Track if sync is initialized
let isInitialized = false;
let channel: BroadcastChannel | null = null;

// Debounce timer for batching updates
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const SYNC_DEBOUNCE_MS = 100;

/**
 * Initialize cross-tab state synchronization.
 * Should be called once when the app starts.
 */
export function initCrossTabSync(): () => void {
  if (isInitialized || typeof window === 'undefined') {
    return () => {};
  }

  // Check BroadcastChannel support
  if (!('BroadcastChannel' in window)) {
    console.warn('[store-sync] BroadcastChannel not supported, cross-tab sync disabled');
    return () => {};
  }

  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    isInitialized = true;

    // Handle incoming messages from other tabs
    channel.onmessage = handleIncomingMessage;

    // Subscribe to store changes and broadcast them
    const unsubscribe = subscribeToStoreChanges();

    // Request full state from other tabs on first load
    requestFullState();

    console.debug('[store-sync] Cross-tab sync initialized', { tabId: TAB_ID });

    // Return cleanup function
    return () => {
      if (channel) {
        channel.close();
        channel = null;
      }
      unsubscribe();
      isInitialized = false;
      console.debug('[store-sync] Cross-tab sync cleaned up');
    };
  } catch (error) {
    console.error('[store-sync] Failed to initialize:', error);
    return () => {};
  }
}

/**
 * Handle incoming messages from other tabs.
 */
function handleIncomingMessage(event: MessageEvent<SyncMessage>): void {
  const message = event.data;

  // Ignore messages from self
  if (message.senderId === TAB_ID) {
    return;
  }

  console.debug('[store-sync] Received message:', message.type);

  switch (message.type) {
    case 'FOLDERS_UPDATE':
      handleFoldersUpdate(message.payload as FoldersUpdatePayload);
      break;

    case 'CONVERSATIONS_UPDATE':
      handleConversationsUpdate(message.payload as ConversationsUpdatePayload);
      break;

    case 'JOB_UPDATE':
      handleJobUpdate(message.payload as JobUpdatePayload);
      break;

    case 'ACTIVE_FOLDER_CHANGE':
      // Only update if we're not currently active
      if (!document.hasFocus()) {
        useAppStore.setState({
          activeFolderId: message.payload as string | null
        });
      }
      break;

    case 'ACTIVE_CONVERSATION_CHANGE':
      // Only update if we're not currently active
      if (!document.hasFocus()) {
        useAppStore.setState({
          activeConversationId: message.payload as string | null
        });
      }
      break;

    case 'FULL_STATE_REQUEST':
      // Another tab is requesting full state, respond with current state
      sendFullStateResponse();
      break;

    case 'FULL_STATE_RESPONSE':
      // Received full state from another tab
      handleFullStateResponse(message.payload as FoldersUpdatePayload & ConversationsUpdatePayload);
      break;
  }
}

/**
 * Handle folders update from another tab.
 */
function handleFoldersUpdate(payload: FoldersUpdatePayload): void {
  const currentState = useAppStore.getState();

  // Merge folders - newer items take precedence
  const mergedFolders = mergeFolders(currentState.folders, payload.folders);

  useAppStore.setState({
    folders: mergedFolders,
    // Only update activeFolderId if we don't have focus
    activeFolderId: !document.hasFocus()
      ? payload.activeFolderId
      : currentState.activeFolderId
  });
}

/**
 * Handle conversations update from another tab.
 */
function handleConversationsUpdate(payload: ConversationsUpdatePayload): void {
  const currentState = useAppStore.getState();

  // Merge conversations - newer items take precedence
  const mergedConversations = mergeConversations(
    currentState.conversations,
    payload.conversations
  );

  useAppStore.setState({
    conversations: mergedConversations,
    // Only update activeConversationId if we don't have focus
    activeConversationId: !document.hasFocus()
      ? payload.activeConversationId
      : currentState.activeConversationId
  });
}

/**
 * Handle job update from another tab.
 */
function handleJobUpdate(payload: JobUpdatePayload): void {
  const currentState = useAppStore.getState();

  // If this tab has an active streaming job, don't override it
  if (currentState.isStreaming && currentState.activeJob) {
    return;
  }

  // If the incoming job is newer or more complete, update
  if (payload.job) {
    const currentJob = currentState.activeJob;
    const shouldUpdate =
      !currentJob ||
      payload.job.id !== currentJob.id ||
      (payload.job.status === 'complete' && currentJob.status !== 'complete');

    if (shouldUpdate) {
      useAppStore.setState({
        activeJob: payload.job,
        isStreaming: payload.isStreaming
      });
    }
  }
}

/**
 * Handle full state response from another tab.
 */
function handleFullStateResponse(
  payload: FoldersUpdatePayload & ConversationsUpdatePayload
): void {
  const currentState = useAppStore.getState();

  // Only apply if we have less data (new tab scenario)
  if (
    currentState.folders.length === 0 ||
    payload.folders.length > currentState.folders.length
  ) {
    useAppStore.setState({
      folders: payload.folders,
      activeFolderId: payload.activeFolderId
    });
  }

  if (
    currentState.conversations.length === 0 ||
    payload.conversations.length > currentState.conversations.length
  ) {
    useAppStore.setState({
      conversations: payload.conversations,
      activeConversationId: payload.activeConversationId
    });
  }
}

/**
 * Subscribe to store changes and broadcast them.
 */
function subscribeToStoreChanges(): () => void {
  let prevState = useAppStore.getState();

  return useAppStore.subscribe((state) => {
    // Debounce to batch rapid changes
    if (syncDebounceTimer) {
      clearTimeout(syncDebounceTimer);
    }

    syncDebounceTimer = setTimeout(() => {
      // Check what changed and broadcast
      if (state.folders !== prevState.folders) {
        broadcastMessage('FOLDERS_UPDATE', {
          folders: state.folders,
          activeFolderId: state.activeFolderId
        });
      }

      if (state.conversations !== prevState.conversations) {
        broadcastMessage('CONVERSATIONS_UPDATE', {
          conversations: state.conversations,
          activeConversationId: state.activeConversationId
        });
      }

      if (state.activeJob !== prevState.activeJob || state.isStreaming !== prevState.isStreaming) {
        broadcastMessage('JOB_UPDATE', {
          job: state.activeJob,
          isStreaming: state.isStreaming
        });
      }

      if (state.activeFolderId !== prevState.activeFolderId) {
        broadcastMessage('ACTIVE_FOLDER_CHANGE', state.activeFolderId);
      }

      if (state.activeConversationId !== prevState.activeConversationId) {
        broadcastMessage('ACTIVE_CONVERSATION_CHANGE', state.activeConversationId);
      }

      prevState = state;
    }, SYNC_DEBOUNCE_MS);
  });
}

/**
 * Broadcast a message to other tabs.
 */
function broadcastMessage(type: SyncMessageType, payload?: unknown): void {
  if (!channel) return;

  const message: SyncMessage = {
    type,
    senderId: TAB_ID,
    timestamp: Date.now(),
    payload
  };

  try {
    channel.postMessage(message);
  } catch (error) {
    console.error('[store-sync] Failed to broadcast:', error);
  }
}

/**
 * Request full state from other tabs.
 */
function requestFullState(): void {
  broadcastMessage('FULL_STATE_REQUEST');
}

/**
 * Send full state response to requesting tab.
 */
function sendFullStateResponse(): void {
  const state = useAppStore.getState();
  broadcastMessage('FULL_STATE_RESPONSE', {
    folders: state.folders,
    activeFolderId: state.activeFolderId,
    conversations: state.conversations,
    activeConversationId: state.activeConversationId
  });
}

/**
 * Merge folder arrays, preferring newer items.
 */
function mergeFolders(local: Folder[], remote: Folder[]): Folder[] {
  const mergedMap = new Map<string, Folder>();

  // Add all local folders
  for (const folder of local) {
    mergedMap.set(folder.id, folder);
  }

  // Merge remote folders (newer wins)
  for (const folder of remote) {
    const existing = mergedMap.get(folder.id);
    if (!existing || folder.updatedAt > existing.updatedAt) {
      mergedMap.set(folder.id, folder);
    }
  }

  // Sort by createdAt descending (newest first)
  return Array.from(mergedMap.values()).sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Merge conversation arrays, preferring newer items.
 */
function mergeConversations(local: Conversation[], remote: Conversation[]): Conversation[] {
  const mergedMap = new Map<string, Conversation>();

  // Add all local conversations
  for (const conv of local) {
    mergedMap.set(conv.id, conv);
  }

  // Merge remote conversations (newer wins)
  for (const conv of remote) {
    const existing = mergedMap.get(conv.id);
    if (!existing || conv.updatedAt > existing.updatedAt) {
      mergedMap.set(conv.id, conv);
    }
  }

  // Sort by createdAt descending (newest first)
  return Array.from(mergedMap.values()).sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Hook to use in components that need to know about sync status.
 */
export function useCrossTabSync(): { isEnabled: boolean; tabId: string } {
  return {
    isEnabled: isInitialized,
    tabId: TAB_ID
  };
}
