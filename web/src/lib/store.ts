import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  AppState,
  Conversation,
  ChatMessage,
  Asset,
  Task,
  StepEvent,
  ViewerTab,
  Structure,
  Folder,
  LayoutMode,
  AtomInfo,
  User,
  Project
} from './types';
import { generateId } from './utils';

// Default user for MVP - single user mode, auth to be implemented later
const DEFAULT_USER: User = {
  id: 'user_default',
  name: 'user',
  email: 'user@simplex.com',
  plan: 'free',
  createdAt: Date.now()
};

// Default project for MVP - single project mode, multi-project to be implemented later
const DEFAULT_PROJECT: Project = {
  id: 'project_default',
  userId: 'user_default',
  name: 'Default Project',
  description: 'Default project for organizing folders',
  createdAt: Date.now(),
  updatedAt: Date.now()
};

// Default sidebar width
const DEFAULT_SIDEBAR_WIDTH = 240;
const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 480;

// Default console width
const DEFAULT_CONSOLE_WIDTH = 410;
const MIN_CONSOLE_WIDTH = 280;
const MAX_CONSOLE_WIDTH = 600;

// Format timestamp for folder naming
function formatFolderTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}_${hours}${minutes}`;
}

/**
 * Generate a unique name by adding suffix (1), (2), etc. if name already exists
 * @param baseName - The desired name
 * @param existingNames - Array of existing names to check against
 * @returns A unique name with suffix if needed
 */
function generateUniqueName(baseName: string, existingNames: string[]): string {
  if (!existingNames.includes(baseName)) {
    return baseName;
  }

  // Extract base name and existing suffix if any
  // e.g., "file(1).txt" -> base="file", ext=".txt", suffix=1
  const extMatch = baseName.match(/^(.+?)(\.[^.]+)?$/);
  const nameWithoutExt = extMatch?.[1] || baseName;
  const ext = extMatch?.[2] || '';

  // Check if name already has a suffix like (1)
  const suffixMatch = nameWithoutExt.match(/^(.+?)\((\d+)\)$/);
  const pureBaseName = suffixMatch?.[1] || nameWithoutExt;

  // Find the next available suffix
  let suffix = 1;
  while (existingNames.includes(`${pureBaseName}(${suffix})${ext}`)) {
    suffix++;
  }

  return `${pureBaseName}(${suffix})${ext}`;
}

// Format timestamp for conversation naming (more readable format)
function formatConversationTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month} ${day}, ${hours}:${minutes}`;
}

// ─── Persist Rehydration Guard (declarations) ───────────────────────────
// These are declared before the store so deleteConversation can reference them.
// The subscribe() call that uses them is placed after store creation.

/** IDs that were intentionally deleted by the user — persist guard must ignore. */
const _intentionallyDeletedConvIds = new Set<string>();

/** Previous snapshot of conversations so the persist guard can detect losses. */
let _prevConversations: Conversation[] = [];

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
  // Current user (MVP: single default user)
  currentUser: DEFAULT_USER,

  // Current project (MVP: single default project)
  currentProject: DEFAULT_PROJECT,

  // Initial state
  conversations: [],
  activeConversationId: null,

  // Folders
  folders: [],
  activeFolderId: null,

  // Layout mode
  layoutMode: 'chat-focus' as LayoutMode,
  isLayoutTransitioning: false,

  // Sidebar
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  sidebarCollapsed: false,

  viewerTabs: [],
  activeTabId: null,

  // Console
  consoleWidth: DEFAULT_CONSOLE_WIDTH,
  consoleCollapsed: false,

  activeTask: null,
  isStreaming: false,
  thumbnails: {},
  isMolstarExpanded: false,
  compareSelection: null,

  // Conversation actions
  createConversation: (folderId?: string) => {
    const id = generateId('conv');
    const now = Date.now();
    const conversation: Conversation = {
      id,
      folderId,  // 1:1 association with Folder
      title: formatConversationTimestamp(now),
      createdAt: now,
      updatedAt: now,
      messages: [],
      assets: []
    };

    set(state => {
      // Update the associated folder with conversationId if folderId is provided
      const updatedFolders = folderId
        ? state.folders.map(folder =>
            folder.id === folderId
              ? { ...folder, conversationId: id }
              : folder
          )
        : state.folders;

      return {
        conversations: [conversation, ...state.conversations],
        activeConversationId: id,
        activeTask: null, // Clear active task when creating new conversation
        activeFolderId: folderId || null, // Set active folder if provided
        // Note: Don't reset isStreaming here - let setActiveTask control it
        // This fixes a race condition where createConversation resets streaming
        // state before setActiveTask can set it to true
        folders: updatedFolders
      };
    });

    return id;
  },

  setActiveConversation: (id) => {
    set(state => {
      // Find the conversation and its associated folder
      const conversation = state.conversations.find(conv => conv.id === id);
      const folderId = conversation?.folderId || null;

      return {
        activeConversationId: id,
        activeTask: null, // Clear active task when switching conversation
        activeFolderId: folderId // Auto-activate associated folder
        // Note: Don't reset isStreaming here - clearing activeTask is sufficient
        // and setActiveTask controls streaming state
      };
    });
  },

  addMessage: (conversationId, messageData) => {
    const message: ChatMessage = {
      id: generateId('msg'),
      timestamp: Date.now(),
      ...messageData
    };

    set(state => {
      const convExists = state.conversations.some(c => c.id === conversationId);
      if (!convExists) {
        // Safety net: conversation was lost (e.g., persist rehydration race).
        // Create it inline to prevent silent message loss.
        const now = Date.now();
        const newConv: Conversation = {
          id: conversationId,
          title: formatConversationTimestamp(now),
          createdAt: now,
          updatedAt: now,
          messages: [message],
          assets: []
        };
        return {
          conversations: [newConv, ...state.conversations],
          activeConversationId: conversationId,
        };
      }
      return {
        conversations: state.conversations.map(conv =>
          conv.id === conversationId
            ? {
              ...conv,
              messages: [...conv.messages, message],
              updatedAt: Date.now()
            }
            : conv
        )
      };
    });
  },

  addAsset: (conversationId, assetData) => {
    const asset: Asset = {
      id: generateId('asset'),
      uploadedAt: Date.now(),
      ...assetData
    };

    set(state => ({
      conversations: state.conversations.map(conv =>
        conv.id === conversationId
          ? {
            ...conv,
            assets: [...conv.assets, asset],
            updatedAt: Date.now()
          }
          : conv
      )
    }));
  },

  deleteConversation: (conversationId) => {
    // Mark as intentionally deleted so the persist guard doesn't re-add it
    _intentionallyDeletedConvIds.add(conversationId);
    set(state => {
      const filteredConversations = state.conversations.filter(conv => conv.id !== conversationId);
      // If deleting the active conversation, switch to another one or null
      const newActiveId = state.activeConversationId === conversationId
        ? (filteredConversations.length > 0 ? filteredConversations[0].id : null)
        : state.activeConversationId;
      return {
        conversations: filteredConversations,
        activeConversationId: newActiveId
      };
    });
  },

  // Folder actions
  createFolder: (name?: string, conversationId?: string) => {
    const id = generateId('folder');
    const now = Date.now();
    const projectId = get().currentProject.id;  // Use current project

    // Generate unique folder name
    const existingFolderNames = get().folders.map(f => f.name);
    const baseName = name || formatFolderTimestamp(now);
    const uniqueName = generateUniqueName(baseName, existingFolderNames);

    const folder: Folder = {
      id,
      projectId,  // Parent project (MVP: project_default)
      name: uniqueName,
      createdAt: now,
      updatedAt: now,
      isExpanded: true,
      inputs: [],
      outputs: [],
      conversationId  // 1:1 association with Conversation
    };

    set(state => ({
      folders: [folder, ...state.folders],
      activeFolderId: id
    }));

    return id;
  },

  setActiveFolder: (id) => {
    set({ activeFolderId: id });
  },

  renameFolder: (id, name) => {
    set(state => ({
      folders: state.folders.map(folder =>
        folder.id === id
          ? { ...folder, name, updatedAt: Date.now() }
          : folder
      )
    }));
  },

  toggleFolderExpanded: (id) => {
    set(state => ({
      folders: state.folders.map(folder =>
        folder.id === id
          ? { ...folder, isExpanded: !folder.isExpanded }
          : folder
      )
    }));
  },

  addFolderInput: (folderId, assetData) => {
    set(state => {
      const folder = state.folders.find(f => f.id === folderId);
      if (!folder) return state;

      // Generate unique file name if duplicate exists
      const existingFileNames = folder.inputs.map(input => input.name);
      const uniqueName = generateUniqueName(assetData.name, existingFileNames);

      // Add new file with unique name
      const asset: Asset = {
        id: generateId('asset'),
        uploadedAt: Date.now(),
        ...assetData,
        name: uniqueName
      };
      const newInputs = [...folder.inputs, asset];

      return {
        folders: state.folders.map(f =>
          f.id === folderId
            ? { ...f, inputs: newInputs, updatedAt: Date.now() }
            : f
        )
      };
    });
  },

  addFolderOutput: (folderId, artifact) => {
    set(state => {
      const folder = state.folders.find(f => f.id === folderId);
      if (!folder) return state;

      // Generate unique filename if duplicate exists
      const existingFileNames = folder.outputs.map(output => output.filename);
      const uniqueFilename = generateUniqueName(artifact.filename, existingFileNames);

      return {
        folders: state.folders.map(f =>
          f.id === folderId
            ? {
              ...f,
              outputs: [...f.outputs, { ...artifact, filename: uniqueFilename }],
              updatedAt: Date.now()
            }
            : f
        )
      };
    });
  },

  deleteFolder: (id) => {
    set(state => {
      const newFolders = state.folders.filter(folder => folder.id !== id);
      let newActiveFolderId = state.activeFolderId;

      if (state.activeFolderId === id) {
        newActiveFolderId = newFolders.length > 0 ? newFolders[0].id : null;
      }

      return {
        folders: newFolders,
        activeFolderId: newActiveFolderId
      };
    });
  },

  // Sidebar actions
  setSidebarWidth: (width) => {
    const clampedWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
    set({ sidebarWidth: clampedWidth });
  },

  setSidebarCollapsed: (collapsed) => {
    set({ sidebarCollapsed: collapsed });
  },

  // Tab actions
  openStructureTab: (structure, pdbData) => {
    const existingTab = get().viewerTabs.find(
      tab => tab.structureId === structure.structureId && !tab.isCompare
    );

    if (existingTab) {
      // Auto-switch to viewer mode when opening a structure
      set({
        activeTabId: existingTab.id,
        layoutMode: 'viewer-focus',
        consoleCollapsed: false
      });
      return;
    }

    const tab: ViewerTab = {
      id: generateId('tab'),
      structureId: structure.structureId,
      label: structure.label,
      filename: structure.filename,
      pdbData
    };

    // Auto-switch to viewer mode and ensure console is visible
    set(state => ({
      viewerTabs: [...state.viewerTabs, tab],
      activeTabId: tab.id,
      layoutMode: 'viewer-focus',
      consoleCollapsed: false
    }));
  },

  openCompareTab: (current, previous) => {
    // Generate a unique compare tab ID based on both structure IDs
    const compareId = `compare_${current.structureId}_${previous.structureId}`;

    // Check if a compare tab for these two structures already exists
    const existingTab = get().viewerTabs.find(
      tab => tab.isCompare &&
        tab.structureId === current.structureId &&
        tab.compareWith?.structureId === previous.structureId
    );

    if (existingTab) {
      set({
        activeTabId: existingTab.id,
        layoutMode: 'viewer-focus',
        consoleCollapsed: false
      });
      return;
    }

    const tab: ViewerTab = {
      id: generateId('cmp'),
      structureId: current.structureId,
      label: `Compare: ${current.label || 'Current'}`,
      filename: current.filename,
      pdbData: current.pdbData || '',
      isCompare: true,
      compareWith: {
        structureId: previous.structureId,
        label: previous.label || 'Previous',
        filename: previous.filename,
        pdbData: previous.pdbData || ''
      }
    };

    set(state => ({
      viewerTabs: [...state.viewerTabs, tab],
      activeTabId: tab.id,
      layoutMode: 'viewer-focus',
      consoleCollapsed: false
    }));
  },

  closeTab: (tabId) => {
    set(state => {
      const newTabs = state.viewerTabs.filter(tab => tab.id !== tabId);
      let newActiveTabId = state.activeTabId;

      if (state.activeTabId === tabId) {
        const index = state.viewerTabs.findIndex(tab => tab.id === tabId);
        if (newTabs.length > 0) {
          newActiveTabId = newTabs[Math.min(index, newTabs.length - 1)]?.id || null;
        } else {
          newActiveTabId = null;
        }
      }

      // Auto-switch back to chat mode when closing last tab (and not streaming)
      const shouldSwitchToChat = newTabs.length === 0 && !state.isStreaming;

      return {
        viewerTabs: newTabs,
        activeTabId: newActiveTabId,
        layoutMode: shouldSwitchToChat ? 'chat-focus' : state.layoutMode
      };
    });
  },

  setActiveTab: (tabId) => {
    set({ activeTabId: tabId });
  },

  setTabSelection: (tabId, selection) => {
    set(state => ({
      viewerTabs: state.viewerTabs.map(tab =>
        tab.id === tabId
          ? { ...tab, selection }
          : tab
      )
    }));
  },

  setTabAtomCount: (tabId, count) => {
    set(state => ({
      viewerTabs: state.viewerTabs.map(tab =>
        tab.id === tabId
          ? { ...tab, atomCount: count }
          : tab
      )
    }));
  },

  setMolstarExpanded: (expanded) => {
    set({ isMolstarExpanded: expanded });
  },

  // Console actions
  setConsoleWidth: (width) => {
    const clampedWidth = Math.min(MAX_CONSOLE_WIDTH, Math.max(MIN_CONSOLE_WIDTH, width));
    set({ consoleWidth: clampedWidth });
  },

  setConsoleCollapsed: (collapsed) => {
    set({ consoleCollapsed: collapsed });
  },

  // Streaming state control
  setIsStreaming: (streaming: boolean) => {
    set({ isStreaming: streaming });
  },

  // Task actions
  setActiveTask: (task) => {
    const isRunning = task?.status === 'running';
    set({
      activeTask: task,
      isStreaming: isRunning,
      // Don't auto-switch layout mode - let user stay in their current mode
      // This prevents EventSource from being closed when ChatView unmounts
      consoleCollapsed: isRunning ? false : get().consoleCollapsed
    });
  },

  addStepEvent: (taskId, event) => {
    set(state => {
      if (state.activeTask?.id !== taskId) {
        return state;
      }

      const newSteps = [...state.activeTask.steps, event];
      const newStructures = event.artifacts
        ? [...state.activeTask.structures, ...event.artifacts]
        : state.activeTask.structures;

      const isDone = event.stage === 'DONE';

      // Update folder outputs immediately when new artifacts arrive
      // This allows real-time display in the sidebar file system
      let updatedFolders = state.folders;
      if (event.artifacts && event.artifacts.length > 0 && state.activeFolderId) {
        updatedFolders = state.folders.map(folder => {
          if (folder.id !== state.activeFolderId) {
            return folder;
          }
          // Get existing output IDs to avoid duplicates
          const existingIds = new Set(folder.outputs.map(o => o.structureId));
          // Filter out artifacts that already exist
          const newArtifacts = event.artifacts!.filter(a => !existingIds.has(a.structureId));
          if (newArtifacts.length === 0) {
            return folder;
          }
          return {
            ...folder,
            outputs: [...folder.outputs, ...newArtifacts],
            taskId: taskId,
            updatedAt: Date.now()
          };
        });
      }

      // When task completes, add artifacts to conversation as a message
      // This ensures historical conversations display the folding results
      let updatedConversations = state.conversations;
      if (isDone && newStructures.length > 0) {
        const conversationId = state.activeTask.conversationId;
        const messageTimestamp = Date.now();

        // Normalize artifact timestamps to ensure consistent ordering on reload
        // Use frontend timestamps relative to message to avoid client/server clock skew issues
        // Each artifact gets a timestamp slightly before the message, preserving order
        const normalizedArtifacts = newStructures.map((artifact, index) => ({
          ...artifact,
          createdAt: messageTimestamp - 1000 + index  // 1 second before message, with order preserved
        }));

        // Only persist artifacts to conversation - the CONCLUSION from backend
        // is shown by TimelineRenderer, so we don't add a mock message here
        updatedConversations = state.conversations.map(conv =>
          conv.id === conversationId
            ? {
                ...conv,
                // Artifacts are stored separately (in steps/structures),
                // CONCLUSION is rendered from timelineByEventType
                updatedAt: messageTimestamp
              }
            : conv
        );
      }

      return {
        activeTask: {
          ...state.activeTask,
          steps: newSteps,
          structures: newStructures,
          status: isDone ? 'complete' : 'running'
        },
        isStreaming: !isDone,
        folders: updatedFolders,
        conversations: updatedConversations
      };
    });
  },

  // Thumbnail actions
  setThumbnail: (structureId, thumbnail) => {
    set(state => ({
      thumbnails: {
        ...state.thumbnails,
        [structureId]: thumbnail
      }
    }));
  },

  // Compare viewer state actions
  setCompareViewMode: (tabId, mode) => {
    set(state => ({
      viewerTabs: state.viewerTabs.map(tab =>
        tab.id === tabId
          ? { ...tab, compareViewMode: mode }
          : tab
      )
    }));
  },

  setCompareCameraSyncEnabled: (tabId, enabled) => {
    set(state => ({
      viewerTabs: state.viewerTabs.map(tab =>
        tab.id === tabId
          ? { ...tab, compareCameraSyncEnabled: enabled }
          : tab
      )
    }));
  },

  // Layout mode actions
  setLayoutMode: (mode) => {
    set({ layoutMode: mode });
  },

  switchToViewerMode: () => {
    set({
      layoutMode: 'viewer-focus',
      consoleCollapsed: false,
      isLayoutTransitioning: true
    });
    // Reset transitioning flag after animation completes
    setTimeout(() => {
      set({ isLayoutTransitioning: false });
    }, 300);
  },

  switchToChatMode: () => {
    set({
      layoutMode: 'chat-focus',
      isLayoutTransitioning: true
    });
    // Reset transitioning flag after animation completes
    setTimeout(() => {
      set({ isLayoutTransitioning: false });
    }, 300);
  },

  // Compare selection actions (two-click compare from timeline)
  selectForCompare: (artifact) => {
    const current = get().compareSelection;

    if (!current) {
      // First selection - store it
      set({ compareSelection: artifact });
    } else if (current.structureId === artifact.structureId) {
      // Clicked same one - deselect
      set({ compareSelection: null });
    } else {
      // Second selection - open compare and clear
      get().openCompareTab(artifact, current);
      set({ compareSelection: null });
    }
  },

  clearCompareSelection: () => {
    set({ compareSelection: null });
  }
    }),
    {
      name: 'chatfold-storage',
      merge: (persistedState, currentState) => {
        const persisted = (persistedState || {}) as Partial<AppState>;
        const current = currentState as AppState;

        // Merge conversations by ID: preserve in-memory conversations that
        // weren't persisted (e.g., newly created ones with no messages yet).
        // This prevents the persist rehydration from overwriting conversations
        // that were created between store initialization and rehydration completion.
        let mergedConversations = current.conversations;
        if (persisted.conversations) {
          const persistedIds = new Set(persisted.conversations.map(c => c.id));
          const inMemoryOnly = current.conversations.filter(c => !persistedIds.has(c.id));
          mergedConversations = [...inMemoryOnly, ...persisted.conversations];
        }

        // Same merge strategy for folders
        let mergedFolders = current.folders;
        if (persisted.folders) {
          const persistedIds = new Set(persisted.folders.map(f => f.id));
          const inMemoryOnly = current.folders.filter(f => !persistedIds.has(f.id));
          mergedFolders = [...inMemoryOnly, ...persisted.folders];
        }

        // For activeConversationId/activeFolderId: prefer the in-memory value
        // if it points to a valid entry, then persisted if valid, otherwise null.
        // This prevents stale IDs from pointing to non-existent entries.
        const validConvId = (id: string | null | undefined): boolean =>
          !!id && mergedConversations.some(c => c.id === id);
        const validFolderId = (id: string | null | undefined): boolean =>
          !!id && mergedFolders.some(f => f.id === id);

        const activeConversationId = validConvId(current.activeConversationId)
          ? current.activeConversationId
          : validConvId(persisted.activeConversationId)
            ? persisted.activeConversationId!
            : null;

        const activeFolderId = validFolderId(current.activeFolderId)
          ? current.activeFolderId
          : validFolderId(persisted.activeFolderId)
            ? persisted.activeFolderId!
            : null;

        return {
          ...current,
          ...persisted,
          conversations: mergedConversations,
          folders: mergedFolders,
          activeConversationId,
          activeFolderId,
        };
      },
      partialize: (state) => {
        // Strip large pdbData from artifacts to avoid localStorage quota issues
        const stripPdbData = (artifact: Structure): Structure => ({
          ...artifact,
          pdbData: undefined, // Don't persist large PDB data
          thumbnail: artifact.thumbnail // Keep small thumbnails
        });

        // Clean conversations: remove pdbData from message artifacts
        // Also filter out empty conversations (no messages) - don't persist blank chats
        const cleanConversations = state.conversations
          .filter(conv => conv.messages.length > 0)
          .map(conv => ({
            ...conv,
            messages: conv.messages.map(msg => ({
              ...msg,
              artifacts: msg.artifacts?.map(stripPdbData)
            }))
          }));

        // Clean folders: remove pdbData from outputs
        const cleanFolders = state.folders.map(folder => ({
          ...folder,
          outputs: folder.outputs.map(stripPdbData)
        }));

        return {
          // Persist layout settings, folders, and conversations
          // Note: active task, streaming state, layoutMode, and pdbData are not persisted
          // layoutMode is intentionally not persisted - always start in chat-focus mode on refresh
          conversations: cleanConversations,
          activeConversationId: state.activeConversationId,
          sidebarWidth: state.sidebarWidth,
          sidebarCollapsed: state.sidebarCollapsed,
          consoleWidth: state.consoleWidth,
          consoleCollapsed: state.consoleCollapsed,
          folders: cleanFolders,
          activeFolderId: state.activeFolderId
        };
      }
    }
  )
);

// ─── Persist Rehydration Guard (subscribe) ──────────────────────────────
// Zustand's persist middleware rehydrates state asynchronously via .then() chains.
// If createConversation() or addMessage() runs before rehydration completes, the
// async rehydration overwrites the newly created conversation with stale persisted
// state. During HMR the store isn't re-initialized, so the custom merge function
// above may not even be active.
//
// This guard subscribes to ALL state changes and re-adds any conversation that
// previously had messages but was suddenly removed (the hallmark of an async
// rehydration overwrite). Intentional deletions are tracked via
// _intentionallyDeletedConvIds so the guard doesn't interfere with them.
// ─────────────────────────────────────────────────────────────────────────

useAppStore.subscribe((state) => {
  // Find conversations that had messages in previous state but are now missing
  const lost = _prevConversations.filter(
    prev =>
      prev.messages.length > 0 &&
      !_intentionallyDeletedConvIds.has(prev.id) &&
      !state.conversations.some(c => c.id === prev.id)
  );

  if (lost.length > 0) {
    useAppStore.setState(prev => ({
      conversations: [...lost, ...prev.conversations]
    }));
    // Don't update _prevConversations here — the setState above will
    // trigger another subscribe call which will handle it.
    return;
  }

  _prevConversations = state.conversations;
});

// Export constants for use in components
export { MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH, DEFAULT_SIDEBAR_WIDTH };
export { MIN_CONSOLE_WIDTH, MAX_CONSOLE_WIDTH, DEFAULT_CONSOLE_WIDTH };
