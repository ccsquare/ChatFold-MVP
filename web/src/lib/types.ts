// Core domain types for ChatFold protein folding workbench

// User model - MVP uses single default user, auth to be implemented later
export type UserPlan = 'free' | 'pro';

export interface User {
  id: string;
  name: string;
  email: string;
  plan: UserPlan;
  createdAt: number;
}

// Project model - MVP uses single default project, multi-project to be implemented later
export interface Project {
  id: string;
  userId: string;           // Owner user ID
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export type StageType = 'QUEUED' | 'MSA' | 'MODEL' | 'RELAX' | 'QA' | 'DONE' | 'ERROR';
export type StatusType = 'queued' | 'running' | 'partial' | 'complete' | 'failed' | 'canceled';

// EventType defines how SSE messages map to UI areas
export type EventType =
  | 'PROLOGUE'       // Area 2: Opening message with key verification points
  | 'ANNOTATION_TEXT' // Text-only annotations
  | 'ANNOTATION_PDB'  // Annotation with structure output
  | 'THINKING_TEXT'  // Area 3: Pure text thinking (scrolling, 2 lines visible)
  | 'THINKING_PDB'   // Area 4: Thinking with structure output (ends a block)
  | 'CONCLUSION'     // Area 5: Final conclusion message
  | 'ANNOTATION';    // Legacy: pre-split annotations

export interface Structure {
  type: 'structure';
  structureId: string;
  label: 'candidate' | 'intermediate' | 'final' | string;
  filename: string;
  pdbData?: string; // PDB file content
  thumbnail?: string; // Base64 encoded thumbnail
  createdAt?: number; // Timestamp when artifact was generated (for timeline ordering)
  cot?: string; // Chain-of-thought reasoning for this structure optimization
}

export interface StepEvent {
  eventId: string;
  taskId: string;
  ts: number;
  eventType: EventType;        // How this event maps to UI areas
  stage: StageType;
  status: StatusType;
  progress: number; // 0-100
  message: string;
  blockIndex?: number | null;  // Thinking block index (for THINKING_TEXT/THINKING_PDB grouping)
  artifacts?: Structure[];
}

export interface Asset {
  id: string;
  name: string;
  type: 'fasta' | 'pdb' | 'text';
  content: string;
  uploadedAt: number;
}

// File reference for @ mentions in chat input
export interface MentionableFile {
  id: string;           // Unique identifier (full path or unique key)
  name: string;         // Display name (filename)
  path: string;         // Full path for disambiguation
  type: string;         // File type: 'fasta', 'pdb', 'structure', etc.
  source?: 'project' | 'conversation' | 'task';  // Optional context
  content?: string;     // File content (for fasta files to expand on send)
}

// Folder contains input sequences and output structures
export interface Folder {
  id: string;
  projectId?: string;     // Parent project (MVP: project_default)
  name: string;           // Default: timestamp, can be renamed
  createdAt: number;
  updatedAt: number;
  isExpanded: boolean;    // For tree view
  inputs: Asset[];        // Input sequence files (uploaded or created from chat)
  outputs: Structure[]; // Generated structure files
  taskId?: string;         // Associated task ID if any
  conversationId?: string; // 1:1 association with Conversation
}

/** Attached file reference for display in messages */
export interface AttachedFile {
  name: string;
  type: 'fasta' | 'pdb' | 'text';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  artifacts?: Structure[];
  /** Files attached to this message (displayed as chips) */
  attachedFiles?: AttachedFile[];
}

export interface Task {
  id: string;
  conversationId: string;
  status: StatusType;
  sequence: string;
  createdAt: number;
  completedAt?: number;
  steps: StepEvent[];
  structures: Structure[];
}

export interface Conversation {
  id: string;
  folderId?: string;      // 1:1 association with Folder
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  assets: Asset[];
}

// Atom information extracted from click events
export interface AtomInfo {
  // Atom info
  element: string;
  atomName: string;
  altId: string | null;
  charge: number;
  // Residue info
  residueName: string;
  residueId: number;
  authResidueId: number;
  insertionCode: string | null;
  isHetAtom: boolean;
  // Chain info
  chainId: string;
  authChainId: string;
  entityId: string;
  // Coordinates (Å)
  coordinates: { x: number; y: number; z: number };
  // Physical properties
  bFactor: number;
  occupancy: number;
  // 3D click position
  clickPosition: { x: number; y: number; z: number } | null;
  // Label for display
  label: string;
}

// View mode for comparison
export type CompareViewMode = 'side-by-side' | 'overlay';

export interface ViewerTab {
  id: string;
  structureId: string;
  label: string;
  filename: string;
  pdbData: string;
  thumbnail?: string;
  selection?: AtomInfo | null;
  atomCount?: number;
  // Comparison mode
  isCompare?: boolean;
  compareWith?: {
    structureId: string;
    label: string;
    filename: string;
    pdbData: string;
  };
  // Compare viewer state (persisted across fullscreen toggle)
  compareViewMode?: CompareViewMode;
  compareCameraSyncEnabled?: boolean;
}

// Layout mode determines the main content area display
export type LayoutMode = 'chat-focus' | 'viewer-focus';

// Store state types
export interface AppState {
  // Current user (MVP: single default user, auth to be implemented)
  currentUser: User;

  // Current project (MVP: single default project)
  currentProject: Project;

  // Conversations
  conversations: Conversation[];
  activeConversationId: string | null;

  // Folders (file management)
  folders: Folder[];
  activeFolderId: string | null;

  // Layout mode (chat-focus: full-width chat, viewer-focus: Canvas + Console)
  layoutMode: LayoutMode;
  isLayoutTransitioning: boolean;

  // Sidebar state
  sidebarWidth: number;
  sidebarCollapsed: boolean;

  // Viewer tabs
  viewerTabs: ViewerTab[];
  activeTabId: string | null;

  // Console state
  consoleWidth: number;
  consoleCollapsed: boolean;

  // Running task
  activeTask: Task | null;
  isStreaming: boolean;
  streamError: string | null;  // Non-null when SSE connection lost unexpectedly (e.g. 'timeout')

  // Thumbnails cache
  thumbnails: Record<string, string>;

  // Mol* built-in expand state
  isMolstarExpanded: boolean;

  // Compare selection (for two-click compare from timeline)
  compareSelection: Structure | null;

  // Actions
  createConversation: (folderId?: string) => string;
  setActiveConversation: (id: string | null) => void;
  addMessage: (conversationId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  addAsset: (conversationId: string, asset: Omit<Asset, 'id' | 'uploadedAt'>) => void;
  deleteConversation: (conversationId: string) => void;

  // Folder actions
  createFolder: (name?: string, conversationId?: string) => string;
  setActiveFolder: (id: string | null) => void;
  renameFolder: (id: string, name: string) => void;
  toggleFolderExpanded: (id: string) => void;
  addFolderInput: (folderId: string, asset: Omit<Asset, 'id' | 'uploadedAt'>) => void;
  addFolderOutput: (folderId: string, artifact: Structure) => void;
  deleteFolder: (id: string) => void;

  // Sidebar actions
  setSidebarWidth: (width: number) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  openStructureTab: (structure: Structure, pdbData: string) => void;
  openCompareTab: (current: Structure, previous: Structure) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  setTabSelection: (tabId: string, selection: AtomInfo | null) => void;
  setTabAtomCount: (tabId: string, count: number) => void;
  setMolstarExpanded: (expanded: boolean) => void;

  setConsoleWidth: (width: number) => void;
  setConsoleCollapsed: (collapsed: boolean) => void;
  setIsStreaming: (streaming: boolean) => void;
  setStreamError: (error: string | null) => void;

  setActiveTask: (task: Task | null) => void;
  addStepEvent: (taskId: string, event: StepEvent) => void;

  setThumbnail: (structureId: string, thumbnail: string) => void;
  setCompareViewMode: (tabId: string, mode: CompareViewMode) => void;
  setCompareCameraSyncEnabled: (tabId: string, enabled: boolean) => void;

  // Layout mode actions
  setLayoutMode: (mode: LayoutMode) => void;
  switchToViewerMode: () => void;
  switchToChatMode: () => void;

  // Compare selection actions (two-click compare from timeline)
  selectForCompare: (artifact: Structure) => void;
  clearCompareSelection: () => void;
}
