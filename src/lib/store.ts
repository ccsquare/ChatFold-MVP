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
  StructureArtifact,
  Project,
  AtomInfo
} from './types';

// Default sidebar width
const DEFAULT_SIDEBAR_WIDTH = 240;
const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 480;

// Default console width
const DEFAULT_CONSOLE_WIDTH = 410;
const MIN_CONSOLE_WIDTH = 280;
const MAX_CONSOLE_WIDTH = 600;

// Format timestamp for project naming
function formatProjectTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}_${hours}${minutes}`;
}

function generateId(prefix: string = ''): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
  // Initial state
  conversations: [],
  activeConversationId: null,

  // Projects
  projects: [],
  activeProjectId: null,

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

  // Conversation actions
  createConversation: () => {
    const id = generateId('conv');
    const conversation: Conversation = {
      id,
      title: 'New Conversation',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      tasks: [],
      assets: []
    };

    set(state => ({
      conversations: [conversation, ...state.conversations],
      activeConversationId: id,
      activeTask: null, // Clear active task when creating new conversation
      activeProjectId: null, // Clear active project for new conversation
      isStreaming: false
    }));

    return id;
  },

  setActiveConversation: (id) => {
    set({
      activeConversationId: id,
      activeTask: null, // Clear active task when switching conversation
      activeProjectId: null, // Clear active project when switching conversation
      isStreaming: false
    });
  },

  addMessage: (conversationId, messageData) => {
    const message: ChatMessage = {
      id: generateId('msg'),
      timestamp: Date.now(),
      ...messageData
    };

    set(state => ({
      conversations: state.conversations.map(conv =>
        conv.id === conversationId
          ? {
            ...conv,
            messages: [...conv.messages, message],
            updatedAt: Date.now()
          }
          : conv
      )
    }));
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

  // Project actions
  createProject: (name?: string) => {
    const id = generateId('proj');
    const now = Date.now();
    const project: Project = {
      id,
      name: name || formatProjectTimestamp(now),
      createdAt: now,
      updatedAt: now,
      isExpanded: true,
      inputs: [],
      outputs: []
    };

    set(state => ({
      projects: [project, ...state.projects],
      activeProjectId: id
    }));

    return id;
  },

  setActiveProject: (id) => {
    set({ activeProjectId: id });
  },

  renameProject: (id, name) => {
    set(state => ({
      projects: state.projects.map(proj =>
        proj.id === id
          ? { ...proj, name, updatedAt: Date.now() }
          : proj
      )
    }));
  },

  toggleProjectExpanded: (id) => {
    set(state => ({
      projects: state.projects.map(proj =>
        proj.id === id
          ? { ...proj, isExpanded: !proj.isExpanded }
          : proj
      )
    }));
  },

  addProjectInput: (projectId, assetData) => {
    const asset: Asset = {
      id: generateId('asset'),
      uploadedAt: Date.now(),
      ...assetData
    };

    set(state => ({
      projects: state.projects.map(proj =>
        proj.id === projectId
          ? {
            ...proj,
            inputs: [...proj.inputs, asset],
            updatedAt: Date.now()
          }
          : proj
      )
    }));
  },

  addProjectOutput: (projectId, artifact) => {
    set(state => ({
      projects: state.projects.map(proj =>
        proj.id === projectId
          ? {
            ...proj,
            outputs: [...proj.outputs, artifact],
            updatedAt: Date.now()
          }
          : proj
      )
    }));
  },

  deleteProject: (id) => {
    set(state => {
      const newProjects = state.projects.filter(proj => proj.id !== id);
      let newActiveProjectId = state.activeProjectId;

      if (state.activeProjectId === id) {
        newActiveProjectId = newProjects.length > 0 ? newProjects[0].id : null;
      }

      return {
        projects: newProjects,
        activeProjectId: newActiveProjectId
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
      tab => tab.structureId === structure.structureId
    );

    if (existingTab) {
      set({ activeTabId: existingTab.id });
      return;
    }

    const tab: ViewerTab = {
      id: generateId('tab'),
      structureId: structure.structureId,
      label: structure.label,
      filename: structure.filename,
      pdbData,
      metrics: structure.metrics
    };

    set(state => ({
      viewerTabs: [...state.viewerTabs, tab],
      activeTabId: tab.id
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

      return {
        viewerTabs: newTabs,
        activeTabId: newActiveTabId
      };
    });
  },

  setActiveTab: (tabId) => {
    set({ activeTabId: tabId });
  },

  // Console actions
  setConsoleWidth: (width) => {
    const clampedWidth = Math.min(MAX_CONSOLE_WIDTH, Math.max(MIN_CONSOLE_WIDTH, width));
    set({ consoleWidth: clampedWidth });
  },

  setConsoleCollapsed: (collapsed) => {
    set({ consoleCollapsed: collapsed });
  },

  // Task actions
  setActiveTask: (task) => {
    set({ activeTask: task, isStreaming: task?.status === 'running' });
  },

  updateTask: (taskId, updates) => {
    set(state => {
      if (state.activeTask?.id === taskId) {
        return {
          activeTask: { ...state.activeTask, ...updates },
          isStreaming: updates.status === 'running'
        };
      }
      return state;
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

      // Only update projects when the stream is complete (DONE event)
      // This avoids race conditions with zustand persist
      let updatedProjects = state.projects;
      if (isDone && state.activeProjectId) {
        const allStructures = newStructures;

        updatedProjects = state.projects.map(proj =>
          proj.id === state.activeProjectId
            ? {
                ...proj,
                outputs: allStructures,
                taskId: taskId,
                updatedAt: Date.now()
              }
            : proj
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
        projects: updatedProjects
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

  setTabSelection: (tabId, selection) => {
    set(state => ({
      viewerTabs: state.viewerTabs.map(tab =>
        tab.id === tabId
          ? { ...tab, selection }
          : tab
      )
    }));
  },

  setTabAtomCount: (tabId, atomCount) => {
    set(state => ({
      viewerTabs: state.viewerTabs.map(tab =>
        tab.id === tabId
          ? { ...tab, atomCount }
          : tab
      )
    }));
  },

  // Molstar expanded state
  setMolstarExpanded: (expanded) => {
    set({ isMolstarExpanded: expanded });
  }
    }),
    {
      name: 'chatfold-storage',
      partialize: (state) => ({
        // Persist layout settings, projects, and conversations
        // Note: active task and streaming state are not persisted
        conversations: state.conversations,
        activeConversationId: state.activeConversationId,
        sidebarWidth: state.sidebarWidth,
        sidebarCollapsed: state.sidebarCollapsed,
        consoleWidth: state.consoleWidth,
        consoleCollapsed: state.consoleCollapsed,
        projects: state.projects,
        activeProjectId: state.activeProjectId
      })
    }
  )
);

// Export constants for use in components
export { MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH, DEFAULT_SIDEBAR_WIDTH };
export { MIN_CONSOLE_WIDTH, MAX_CONSOLE_WIDTH, DEFAULT_CONSOLE_WIDTH };
