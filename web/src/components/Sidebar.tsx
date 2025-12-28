'use client';

import { useState, useRef, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { cn, formatTimestamp, downloadPDBFile } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  PanelLeftClose,
  Plus,
  Upload,
  FolderOpen,
  FolderClosed,
  FileInput,
  ChevronRight,
  ChevronDown,
  MessageCircle,
  Loader2,
  Trash2,
  Pencil,
  Download,
  Eye,
  Crown,
} from 'lucide-react';
import { HelixIcon } from '@/components/icons/ProteinIcon';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Project, Asset, StructureArtifact } from '@/lib/types';

interface ProjectItemProps {
  project: Project;
  isActive: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onOpenStructure: (structure: StructureArtifact) => void;
  onOpenAsset: (asset: Asset) => void;
}

function ProjectItem({
  project,
  isActive,
  onSelect,
  onToggle,
  onRename,
  onDelete,
  onOpenStructure,
  onOpenAsset,
}: ProjectItemProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(project.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleStartRename = useCallback(() => {
    setRenameValue(project.name);
    setIsRenaming(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [project.name]);

  const handleSubmitRename = useCallback(() => {
    if (renameValue.trim() && renameValue !== project.name) {
      onRename(renameValue.trim());
    }
    setIsRenaming(false);
  }, [renameValue, project.name, onRename]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmitRename();
    } else if (e.key === 'Escape') {
      setIsRenaming(false);
      setRenameValue(project.name);
    }
  }, [handleSubmitRename, project.name]);

  const handleDownload = useCallback((asset: Asset) => {
    const blob = new Blob([asset.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = asset.name;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleDownloadStructure = useCallback((structure: StructureArtifact) => {
    if (structure.pdbData) {
      downloadPDBFile(structure.pdbData, structure.filename);
    }
  }, []);

  return (
    <li className="select-none">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={cn(
              "flex items-center gap-1 px-1 py-0.5 rounded cursor-pointer group",
              isActive ? "bg-cf-highlight-strong" : "hover:bg-cf-highlight"
            )}
            onClick={onSelect}
          >
            {/* Expand/Collapse Toggle */}
            <button
              className="p-0.5 hover:bg-cf-highlight-strong rounded group/toggle"
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
            >
              {project.isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-cf-text-secondary group-hover/toggle:text-cf-text transition-colors" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-cf-text-secondary group-hover/toggle:text-cf-text transition-colors" />
              )}
            </button>

            {/* Folder Icon */}
            {project.isExpanded ? (
              <FolderOpen className="w-4 h-4 text-cf-warning/70 flex-shrink-0" />
            ) : (
              <FolderClosed className="w-4 h-4 text-cf-warning/70 flex-shrink-0" />
            )}

            {/* Name (Editable) */}
            {isRenaming ? (
              <Input
                ref={inputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleSubmitRename}
                onKeyDown={handleKeyDown}
                className="h-5 text-[13px] px-1 py-0 bg-cf-bg-secondary border-cf-accent"
                onClick={(e) => e.stopPropagation()}
                autoFocus
              />
            ) : (
              <span className="text-[13px] truncate flex-1 text-cf-text">
                {project.name}
              </span>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={handleStartRename}>
            <Pencil className="w-3.5 h-3.5 mr-2" />
            Rename
          </ContextMenuItem>
          <ContextMenuItem onClick={onDelete} className="text-cf-error">
            <Trash2 className="w-3.5 h-3.5 mr-2" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Expanded Content */}
      {project.isExpanded && (
        <ul className="ml-4 border-l border-cf-border/50">
          {/* Input Files */}
          {project.inputs.length > 0 && (
            <li className="ml-2 mt-0.5">
              <span className="text-[11px] text-cf-text-muted uppercase tracking-wide px-1">
                Inputs
              </span>
              <ul>
                {project.inputs.map((input) => (
                  <li key={input.id}>
                    <ContextMenu>
                      <ContextMenuTrigger asChild>
                        <div
                          className="flex items-center gap-1 px-1 py-0.5 hover:bg-cf-highlight rounded cursor-pointer group"
                          onClick={() => onOpenAsset(input)}
                        >
                          <FileInput className="w-3.5 h-3.5 text-cf-info/70 flex-shrink-0" />
                          <span className="text-[12px] truncate text-cf-text-secondary">
                            {input.name}
                          </span>
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem onClick={() => onOpenAsset(input)}>
                          <Eye className="w-3.5 h-3.5 mr-2" />
                          Open
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => handleDownload(input)}>
                          <Download className="w-3.5 h-3.5 mr-2" />
                          Download
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  </li>
                ))}
              </ul>
            </li>
          )}

          {/* Output Structures */}
          {project.outputs.length > 0 && (
            <li className="ml-2 mt-0.5">
              <span className="text-[11px] text-cf-text-muted uppercase tracking-wide px-1">
                Outputs
              </span>
              <ul>
                {project.outputs.map((output) => (
                  <li key={output.structureId}>
                    <ContextMenu>
                      <ContextMenuTrigger asChild>
                        <div
                          className="flex items-center gap-1 px-1 py-0.5 hover:bg-cf-highlight rounded cursor-pointer group"
                          onClick={() => onOpenStructure(output)}
                        >
                          <HelixIcon className="w-3.5 h-3.5 text-cf-success/70 flex-shrink-0" />
                          <span className="text-[12px] truncate text-cf-text-secondary">
                            {output.filename}
                          </span>
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem onClick={() => onOpenStructure(output)}>
                          <Eye className="w-3.5 h-3.5 mr-2" />
                          Open in Viewer
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => handleDownloadStructure(output)}>
                          <Download className="w-3.5 h-3.5 mr-2" />
                          Download PDB
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  </li>
                ))}
              </ul>
            </li>
          )}

          {/* Empty State */}
          {project.inputs.length === 0 && project.outputs.length === 0 && (
            <li className="ml-2 px-1 py-1">
              <span className="text-[11px] text-cf-text-muted italic">
                No files yet
              </span>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

export function Sidebar() {
  const {
    conversations,
    activeConversationId,
    createConversation,
    setActiveConversation,
    deleteConversation,
    addAsset,
    activeTask,
    projects,
    activeProjectId,
    createProject,
    setActiveProject,
    renameProject,
    toggleProjectExpanded,
    addProjectInput,
    deleteProject,
    openStructureTab,
    setSidebarCollapsed,
  } = useAppStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const handleNewChat = () => {
    createConversation();
  };

  const handleDeleteConversation = useCallback((convId: string) => {
    deleteConversation(convId);
    setConfirmingDeleteId(null);
  }, [deleteConversation]);

  const handleNewProject = () => {
    createProject();
  };

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;

    // Create a new project for the uploaded files
    let projId = activeProjectId;
    if (!projId) {
      projId = createProject();
    }

    // Also maintain backward compatibility with conversations
    let convId = activeConversationId;
    if (!convId) {
      convId = createConversation();
    }

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const type = file.name.toLowerCase().endsWith('.pdb') ? 'pdb' : 'fasta';

        // Add to project
        addProjectInput(projId!, {
          name: file.name,
          type,
          content
        });

        // Also add to conversation for backward compatibility
        addAsset(convId!, {
          name: file.name,
          type,
          content
        });
      };
      reader.readAsText(file);
    });
  }, [activeProjectId, activeConversationId, createProject, createConversation, addProjectInput, addAsset]);

  const handleOpenStructure = useCallback((structure: StructureArtifact) => {
    if (structure.pdbData) {
      openStructureTab(structure, structure.pdbData);
    }
  }, [openStructureTab]);

  const handleOpenAsset = useCallback((asset: Asset) => {
    // Convert Asset to a structure-like object for the viewer
    const structure: StructureArtifact = {
      type: 'structure',
      structureId: asset.id,
      label: asset.name,
      filename: asset.name,
      pdbData: asset.content
    };
    openStructureTab(structure, asset.content);
  }, [openStructureTab]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-full">
        {/* Header */}
        <header className="flex items-center justify-between px-3 h-10 border-b border-cf-border">
          <div className="flex items-center gap-1 opacity-80">
            <div className="w-5 h-5 bg-gradient-to-br from-purple-500 to-pink-500 rounded-md" aria-hidden="true" />
            <span className="text-sm font-semibold text-cf-text">ChatFold</span>
          </div>
          <div className="flex items-center gap-0.5">
            <ThemeToggle />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-cf-text-secondary hover:text-cf-text hover:bg-cf-highlight transition-colors"
                  onClick={() => setSidebarCollapsed(true)}
                >
                  <PanelLeftClose className="w-4 h-4" aria-hidden="true" />
                  <span className="sr-only">Collapse sidebar</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Collapse sidebar</TooltipContent>
            </Tooltip>
          </div>
        </header>

        {/* Project Files Header */}
        <div className="flex items-center justify-between px-2 py-1">
          <div className="flex items-center gap-1">
            <FolderOpen className="w-4 h-4 text-cf-text-secondary" aria-hidden="true" />
            <span className="text-[13px] font-medium text-cf-text">Projects</span>
          </div>
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost-icon"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="sr-only">Upload file</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Upload file</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost-icon"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleNewProject}
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="sr-only">New project</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>New project</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Hidden file input for upload button */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".fasta,.fa,.pdb,.txt"
          multiple
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
          aria-label="Select FASTA or PDB files"
        />

        {/* Projects Tree */}
        <ScrollArea className="flex-1 px-2">
          <nav aria-label="Project files">
            {/* Active Task Indicator */}
            {activeTask && activeTask.status === 'running' && (
              <div className="flex items-center gap-1.5 px-2 py-1.5 mb-2 bg-cf-success/10 rounded-lg" role="status" aria-live="polite">
                <Loader2 className="w-4 h-4 text-cf-success animate-spin" aria-hidden="true" />
                <span className="text-[12px] font-medium text-cf-success truncate">
                  Folding in progress...
                </span>
              </div>
            )}

            {/* Projects List */}
            <ul role="tree" aria-label="Projects">
              {projects.map(project => (
                <ProjectItem
                  key={project.id}
                  project={project}
                  isActive={project.id === activeProjectId}
                  onSelect={() => setActiveProject(project.id)}
                  onToggle={() => toggleProjectExpanded(project.id)}
                  onRename={(name) => renameProject(project.id, name)}
                  onDelete={() => deleteProject(project.id)}
                  onOpenStructure={handleOpenStructure}
                  onOpenAsset={handleOpenAsset}
                />
              ))}
            </ul>

            {/* Empty State */}
            {projects.length === 0 && (
              <div className="text-center py-6 px-2">
                <HelixIcon className="w-8 h-8 mx-auto mb-2 text-cf-text-muted opacity-30" />
                <p className="text-[12px] text-cf-text-muted">
                  No projects yet
                </p>
                <p className="text-[11px] text-cf-text-muted mt-1">
                  Upload files or paste a sequence to create one
                </p>
              </div>
            )}

          </nav>
        </ScrollArea>

        {/* Divider */}
        <div className="h-px bg-cf-border" role="separator" />

        {/* Conversations List */}
        <nav className="px-2 py-2" aria-label="Recent conversations">
          <div className="flex items-center justify-between px-1 mb-1">
            <div className="flex items-center gap-1">
              <MessageCircle className="w-3 h-3 text-cf-text-muted" aria-hidden="true" />
              <span className="text-xs text-cf-text-muted">Recent Chats</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] text-cf-text-secondary hover:text-cf-text hover:bg-cf-highlight"
              onClick={() => createConversation()}
            >
              <Plus className="w-3 h-3 mr-1" />
              New
            </Button>
          </div>
          <ScrollArea className="max-h-[160px]">
            <ul role="list">
              {conversations.map(conv => (
                <li key={conv.id} className="group relative">
                  {confirmingDeleteId === conv.id ? (
                    // Confirmation UI
                    <div className="flex items-center justify-between px-2 py-1.5 bg-cf-error/10 rounded">
                      <span className="text-[11px] text-cf-error">Delete?</span>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-2 text-[10px] text-cf-text-muted hover:text-cf-text hover:bg-cf-highlight"
                          onClick={() => setConfirmingDeleteId(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-2 text-[10px] text-cf-error hover:text-cf-error/80 hover:bg-cf-error/20"
                          onClick={() => handleDeleteConversation(conv.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // Normal conversation item
                    <div
                      className={cn(
                        "flex items-center w-full h-auto px-2 py-1 rounded cursor-pointer",
                        conv.id === activeConversationId ? "bg-cf-highlight-strong" : "hover:bg-cf-highlight"
                      )}
                      onClick={() => setActiveConversation(conv.id)}
                    >
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-[12px] font-medium text-cf-text truncate">{conv.title}</p>
                        <p className="text-[10px] text-cf-text-muted">{formatTimestamp(conv.updatedAt)}</p>
                      </div>
                      <Button
                        variant="ghost-icon-danger"
                        size="icon"
                        className="h-5 w-5 opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmingDeleteId(conv.id);
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
              {conversations.length === 0 && (
                <li className="text-[11px] text-cf-text-muted text-center py-3">No conversations yet</li>
              )}
            </ul>
          </ScrollArea>
        </nav>

        {/* Footer */}
        <footer className="border-t border-cf-border p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500" aria-hidden="true" />
              <div>
                <p className="text-[12px] font-medium text-cf-text">User</p>
                <p className="text-[10px] text-cf-text-secondary">Free</p>
              </div>
            </div>
            <Button
              size="sm"
              className="bg-cf-accent hover:bg-cf-accent/90 text-white hover:text-white text-[11px] font-medium rounded-full h-7 px-3"
            >
              <Crown className="w-3 h-3 mr-0.5" />
              Upgrade
            </Button>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}
