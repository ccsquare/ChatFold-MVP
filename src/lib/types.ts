// Core domain types for ChatFold protein folding workbench

export type StageType = 'QUEUED' | 'MSA' | 'MODEL' | 'RELAX' | 'QA' | 'DONE' | 'ERROR';
export type StatusType = 'queued' | 'running' | 'partial' | 'complete' | 'failed' | 'canceled';

export interface StructureMetrics {
  plddtAvg: number;   // 0-100, 预测置信度
  paeAvg: number;     // 0-30, 预测误差
  constraint: number; // 0-100, 约束满足度
}

export interface StructureArtifact {
  type: 'structure';
  structureId: string;
  label: 'candidate' | 'intermediate' | 'final' | string;
  filename: string;
  metrics: StructureMetrics;
  pdbData?: string; // PDB file content
  thumbnail?: string; // Base64 encoded thumbnail
  createdAt?: number; // Timestamp when artifact was generated (for timeline ordering)
}

export interface StepEvent {
  eventId: string;
  taskId: string;
  ts: number;
  stage: StageType;
  status: StatusType;
  progress: number; // 0-100
  message: string;
  artifacts?: StructureArtifact[];
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
}

// Project represents a folder containing input sequences and output structures
export interface Project {
  id: string;
  name: string;           // Default: timestamp, can be renamed
  createdAt: number;
  updatedAt: number;
  isExpanded: boolean;    // For tree view
  inputs: Asset[];        // Input sequence files (uploaded or created from chat)
  outputs: StructureArtifact[]; // Generated structure files
  taskId?: string;        // Associated task ID if any
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  artifacts?: StructureArtifact[];
  foldSteps?: FoldStep[];  // For assistant messages with folding timeline
}

export interface Task {
  id: string;
  conversationId: string;
  status: StatusType;
  sequence: string;
  createdAt: number;
  completedAt?: number;
  steps: StepEvent[];
  structures: StructureArtifact[];
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  tasks: Task[];
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

export interface ViewerTab {
  id: string;
  structureId: string;
  label: string;
  filename: string;
  pdbData: string;
  metrics?: StructureMetrics;
  thumbnail?: string;
  selection?: AtomInfo | null;
  atomCount?: number;
}

/**
 * @deprecated Use StructureArtifact with StepEvent instead.
 * This type will be removed in a future version.
 * Folding step for timeline viewer (legacy)
 */
export interface FoldStep {
  id: string;
  stepNumber: number;
  status: 'completed' | 'active' | 'pending';
  structureId: string;
  label: string;
  stage: StageType;
  metrics: {
    rmsd: number;
    energy: number;
    time: number;
    hBonds: number;
    hydrophobic: number;
  };
  pdbData?: string;
}

// Layout mode determines the main content area display
export type LayoutMode = 'chat-focus' | 'viewer-focus';

// Store state types
export interface AppState {
  // Conversations
  conversations: Conversation[];
  activeConversationId: string | null;

  // Projects (folder-based file management)
  projects: Project[];
  activeProjectId: string | null;

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

  // Thumbnails cache
  thumbnails: Record<string, string>;

  // Molstar expanded state (for hiding overlays when Mol* is in fullscreen)
  isMolstarExpanded: boolean;

  // Actions
  createConversation: () => string;
  setActiveConversation: (id: string | null) => void;
  addMessage: (conversationId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  addAsset: (conversationId: string, asset: Omit<Asset, 'id' | 'uploadedAt'>) => void;
  deleteConversation: (conversationId: string) => void;

  // Project actions
  createProject: (name?: string) => string;
  setActiveProject: (id: string | null) => void;
  renameProject: (id: string, name: string) => void;
  toggleProjectExpanded: (id: string) => void;
  addProjectInput: (projectId: string, asset: Omit<Asset, 'id' | 'uploadedAt'>) => void;
  addProjectOutput: (projectId: string, artifact: StructureArtifact) => void;
  deleteProject: (id: string) => void;

  // Sidebar actions
  setSidebarWidth: (width: number) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  openStructureTab: (structure: StructureArtifact, pdbData: string) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;

  setConsoleWidth: (width: number) => void;
  setConsoleCollapsed: (collapsed: boolean) => void;

  setActiveTask: (task: Task | null) => void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  addStepEvent: (taskId: string, event: StepEvent) => void;

  setThumbnail: (structureId: string, thumbnail: string) => void;
  setTabSelection: (tabId: string, selection: AtomInfo | null) => void;
  setTabAtomCount: (tabId: string, atomCount: number) => void;
  setMolstarExpanded: (expanded: boolean) => void;

  // Layout mode actions
  setLayoutMode: (mode: LayoutMode) => void;
  switchToViewerMode: () => void;
  switchToChatMode: () => void;
}
