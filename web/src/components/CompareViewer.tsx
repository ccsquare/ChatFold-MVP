'use client';

import { useCallback, useId, useRef, useEffect, useState } from 'react';
import { ViewerTab, CompareViewMode } from '@/lib/types';
import { useAppStore } from '@/lib/store';
import { cn, downloadFile } from '@/lib/utils';
import { MolstarViewer } from './molstar';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Link2,
  Link2Off,
  RotateCcw,
  Layers,
  Download,
  Camera,
  Maximize2,
  Minimize2,
  SplitSquareHorizontal,
  Combine,
  Loader2,
} from 'lucide-react';
import { resetSyncGroupCamera } from '@/hooks/useCameraSync';

interface CompareViewerProps {
  tab: ViewerTab;
  className?: string;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

/**
 * Compare two protein structures side by side or overlaid with synchronized camera.
 * Shows current structure on the right and previous structure on the left (side-by-side mode)
 * or both structures superimposed in a single viewer (overlay mode).
 */
export function CompareViewer({ tab, className, isExpanded = false, onToggleExpand }: CompareViewerProps) {
  // Generate unique sync group ID for this comparison
  const syncGroupId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  // Get persisted state from store (with defaults)
  const setCompareViewMode = useAppStore(state => state.setCompareViewMode);
  const setCompareCameraSyncEnabled = useAppStore(state => state.setCompareCameraSyncEnabled);

  // Use store state with defaults
  const viewMode: CompareViewMode = tab.compareViewMode ?? 'overlay';
  const cameraSyncEnabled = tab.compareCameraSyncEnabled ?? true;

  // Toggle view mode (persisted to store)
  const handleToggleViewMode = useCallback(() => {
    const newMode = viewMode === 'side-by-side' ? 'overlay' : 'side-by-side';
    setCompareViewMode(tab.id, newMode);
  }, [tab.id, viewMode, setCompareViewMode]);

  // Toggle camera sync (persisted to store)
  const handleToggleCameraSync = useCallback(() => {
    setCompareCameraSyncEnabled(tab.id, !cameraSyncEnabled);
  }, [tab.id, cameraSyncEnabled, setCompareCameraSyncEnabled]);

  // Reset all cameras to default view
  const handleResetCameras = useCallback(() => {
    resetSyncGroupCamera(syncGroupId);
    // Also dispatch event for overlay viewer
    window.dispatchEvent(new CustomEvent('compare-overlay-reset-camera'));
  }, [syncGroupId]);

  // Download a structure
  const handleDownload = useCallback((pdbData: string, filename: string) => {
    downloadFile(pdbData, filename, 'chemical/x-pdb');
  }, []);

  // Screenshot the comparison view
  const handleScreenshot = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    // Find all canvases in the comparison view
    const canvases = container.querySelectorAll('canvas');
    if (canvases.length === 0) return;

    // Create a combined canvas for the screenshot
    const combinedCanvas = document.createElement('canvas');
    const ctx = combinedCanvas.getContext('2d');
    if (!ctx) return;

    // Calculate total dimensions
    let totalWidth = 0;
    let maxHeight = 0;
    canvases.forEach(canvas => {
      totalWidth += canvas.width;
      maxHeight = Math.max(maxHeight, canvas.height);
    });

    combinedCanvas.width = totalWidth;
    combinedCanvas.height = maxHeight;

    // Draw each canvas
    let xOffset = 0;
    canvases.forEach(canvas => {
      ctx.drawImage(canvas, xOffset, 0);
      xOffset += canvas.width;
    });

    // Download
    const link = document.createElement('a');
    link.download = `comparison_${tab.compareWith?.label || 'prev'}_${tab.label.replace('Compare: ', '')}_screenshot.png`;
    link.href = combinedCanvas.toDataURL('image/png');
    link.click();
  }, [tab]);

  if (!tab.isCompare || !tab.compareWith) {
    return (
      <div className="flex-1 flex items-center justify-center text-cf-text-muted">
        <p>No comparison data available</p>
      </div>
    );
  }

  const current = {
    structureId: tab.structureId,
    label: tab.label.replace('Compare: ', ''),
    filename: tab.filename,
    pdbData: tab.pdbData
  };

  const previous = tab.compareWith;

  return (
    <TooltipProvider delayDuration={300}>
    <div ref={containerRef} className={cn("flex flex-col h-full", className)}>
      {/* Unified Toolbar */}
      <div className="flex items-center justify-between h-10 px-4 border-b border-cf-border bg-cf-bg-tertiary">
        {/* Left: Title and comparison info */}
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-cf-text" />
          <span className="text-[13px] font-medium text-cf-text">Comparison</span>
          <span className="text-xs text-cf-text-muted hidden sm:inline">
            {previous.label} → {current.label}
          </span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1">
          {/* Download dropdown */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost-icon"
                    size="icon"
                    className="h-8 w-8"
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Download PDB</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleDownload(previous.pdbData, previous.filename)}>
                <Download className="w-4 h-4 mr-2" />
                {previous.label} (Previous)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDownload(current.pdbData, current.filename)}>
                <Download className="w-4 h-4 mr-2" />
                {current.label} (Current)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Screenshot */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost-icon"
                size="icon"
                className="h-8 w-8"
                onClick={handleScreenshot}
              >
                <Camera className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Screenshot comparison</TooltipContent>
          </Tooltip>

          {/* Reset cameras */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost-icon"
                size="icon"
                className="h-8 w-8"
                onClick={handleResetCameras}
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset camera views</TooltipContent>
          </Tooltip>

          {/* Separator */}
          <div className="w-px h-5 bg-cf-border mx-1" />

          {/* Camera sync toggle - only show in side-by-side mode */}
          {viewMode === 'side-by-side' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={cameraSyncEnabled ? "ghost-icon-active" : "ghost-icon"}
                  size="icon"
                  onClick={handleToggleCameraSync}
                  className="h-8 w-8"
                >
                  {cameraSyncEnabled ? (
                    <Link2 className="w-4 h-4" />
                  ) : (
                    <Link2Off className="w-4 h-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {cameraSyncEnabled ? 'Camera sync enabled' : 'Camera sync disabled'}
              </TooltipContent>
            </Tooltip>
          )}

          {/* View mode toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={viewMode === 'overlay' ? "ghost-icon-active" : "ghost-icon"}
                size="icon"
                onClick={handleToggleViewMode}
                className="h-8 w-8"
              >
                {viewMode === 'overlay' ? (
                  <Combine className="w-4 h-4" />
                ) : (
                  <SplitSquareHorizontal className="w-4 h-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {viewMode === 'overlay' ? 'Overlay mode (click for side-by-side)' : 'Side-by-side mode (click for overlay)'}
            </TooltipContent>
          </Tooltip>

          {/* Fullscreen toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost-icon"
                size="icon"
                className="h-8 w-8"
                onClick={onToggleExpand}
              >
                {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isExpanded ? 'Exit fullscreen' : 'Fullscreen'}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* View area */}
      {viewMode === 'side-by-side' ? (
        /* Side-by-side comparison */
        <div className="flex-1 flex overflow-hidden">
          {/* Previous structure (left) */}
          <div className="flex-1 flex flex-col border-r border-cf-border">
            <StructurePanel
              title="Previous"
              label={previous.label}
              filename={previous.filename}
              structureId={previous.structureId}
              pdbData={previous.pdbData}
              syncGroupId={syncGroupId}
              syncEnabled={cameraSyncEnabled}
              tabId={`compare-prev-${tab.id}`}
            />
          </div>

          {/* Current structure (right) */}
          <div className="flex-1 flex flex-col">
            <StructurePanel
              title="Current"
              label={current.label}
              filename={current.filename}
              structureId={current.structureId}
              pdbData={current.pdbData}
              syncGroupId={syncGroupId}
              syncEnabled={cameraSyncEnabled}
              tabId={`compare-curr-${tab.id}`}
              isCurrent
            />
          </div>
        </div>
      ) : (
        /* Overlay comparison - both structures in single viewer */
        <SuperposedViewer
          tabId={`compare-overlay-${tab.id}`}
          previousPdbData={previous.pdbData}
          previousLabel={previous.label}
          previousStructureId={previous.structureId}
          previousFilename={previous.filename}
          currentPdbData={current.pdbData}
          currentLabel={current.label}
          currentStructureId={current.structureId}
          currentFilename={current.filename}
        />
      )}
    </div>
    </TooltipProvider>
  );
}

/**
 * Individual structure panel with header and viewer
 * Uses Molstar's native UI panels for structure manipulation
 */
function StructurePanel({
  title,
  label,
  filename,
  structureId,
  pdbData,
  syncGroupId,
  syncEnabled,
  tabId,
  isCurrent = false
}: {
  title: string;
  label: string;
  filename: string;
  structureId: string;
  pdbData: string;
  syncGroupId: string;
  syncEnabled: boolean;
  tabId: string;
  isCurrent?: boolean;
}) {
  // Detect format from filename extension
  const getFormat = (): 'pdb' | 'mmcif' => {
    const lowerFilename = filename.toLowerCase();
    if (lowerFilename.endsWith('.cif') || lowerFilename.endsWith('.mmcif')) {
      return 'mmcif';
    }
    return 'pdb';
  };

  return (
    <>
      {/* Panel header */}
      <div className={cn(
        "flex items-center justify-between px-3 py-1.5 border-b",
        isCurrent
          ? "bg-cf-accent/5 border-cf-accent/20"
          : "bg-cf-bg-tertiary border-cf-border"
      )}>
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-xs font-semibold uppercase tracking-wide",
            isCurrent ? "text-cf-accent" : "text-cf-text-muted"
          )}>
            {title}
          </span>
          <span className="text-xs text-cf-text-secondary truncate max-w-[120px]">
            {label}
          </span>
        </div>
      </div>

      {/* Mol* viewer with native UI panels */}
      <div className="flex-1 relative">
        <MolstarViewer
          tabId={tabId}
          pdbData={pdbData}
          structureId={structureId}
          format={getFormat()}
          showControls={true}
          minimalUI={false}
          syncGroupId={syncGroupId}
          syncEnabled={syncEnabled}
        />
      </div>
    </>
  );
}

/**
 * SuperposedViewer: Overlay two structures in a single Mol* viewer with superposition
 * Uses Mol*'s alignAndSuperpose to structurally align the structures
 */
interface SuperposedViewerProps {
  tabId: string;
  previousPdbData: string;
  previousLabel: string;
  previousStructureId: string;
  previousFilename: string;
  currentPdbData: string;
  currentLabel: string;
  currentStructureId: string;
  currentFilename: string;
}

// Colors for the two structures (hex values for Mol*)
const PREVIOUS_COLOR = 0x3498db; // Blue
const CURRENT_COLOR = 0xe74c3c; // Red

function SuperposedViewer({
  tabId,
  previousPdbData,
  previousLabel,
  previousStructureId,
  previousFilename,
  currentPdbData,
  currentLabel,
  currentStructureId,
  currentFilename,
}: SuperposedViewerProps) {
  // Detect format from filename extension
  const getFormat = (filename: string): 'pdb' | 'mmcif' => {
    const lowerFilename = filename.toLowerCase();
    if (lowerFilename.endsWith('.cif') || lowerFilename.endsWith('.mmcif')) {
      return 'mmcif';
    }
    return 'pdb';
  };
  const containerRef = useRef<HTMLDivElement>(null);
  const pluginRef = useRef<any>(null);
  const isMountedRef = useRef(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [superpositionInfo, setSuperpositionInfo] = useState<{
    rmsd: number;
    alignedLength: number;
  } | null>(null);

  // Initialize viewer and load structures with superposition
  useEffect(() => {
    isMountedRef.current = true;

    const initAndLoad = async () => {
      if (!containerRef.current) return;

      setIsLoading(true);
      setError(null);

      try {
        // Dynamic import Mol* modules
        const [
          pluginUI,
          react18,
          spec,
          commands,
          config,
          color,
          structureModule,
          linearAlgebra,
        ] = await Promise.all([
          import('molstar/lib/mol-plugin-ui'),
          import('molstar/lib/mol-plugin-ui/react18'),
          import('molstar/lib/mol-plugin-ui/spec'),
          import('molstar/lib/mol-plugin/commands'),
          import('molstar/lib/mol-plugin/config'),
          import('molstar/lib/mol-util/color'),
          import('molstar/lib/mol-model/structure'),
          import('molstar/lib/mol-math/linear-algebra'),
        ]);

        const { createPluginUI } = pluginUI;
        const { renderReact18 } = react18;
        const { DefaultPluginUISpec } = spec;
        const { PluginCommands } = commands;
        const { PluginConfig } = config;
        const { Color } = color;
        const { StructureSelection, StructureElement, QueryContext } = structureModule;
        const { Mat4 } = linearAlgebra;

        // Import superposition utilities
        const superpositionModule = await import('molstar/lib/mol-model/structure/structure/util/superposition');
        const { alignAndSuperpose } = superpositionModule;

        // Import MolScript for queries
        const molScript = await import('molstar/lib/mol-script/language/builder');
        const { MolScriptBuilder: MS } = molScript;
        const compilerModule = await import('molstar/lib/mol-script/runtime/query/compiler');
        const { compile } = compilerModule;

        // Import StateTransforms
        const transformsModule = await import('molstar/lib/mol-plugin-state/transforms');
        const { StateTransforms } = transformsModule;

        if (!isMountedRef.current || !containerRef.current) return;

        // Clear container
        containerRef.current.innerHTML = '';

        // Create Mol* div
        const molstarDiv = document.createElement('div');
        molstarDiv.style.width = '100%';
        molstarDiv.style.height = '100%';
        molstarDiv.style.position = 'absolute';
        molstarDiv.style.top = '0';
        molstarDiv.style.left = '0';
        containerRef.current.appendChild(molstarDiv);

        // Create plugin with full UI
        const pluginSpec = {
          ...DefaultPluginUISpec(),
          layout: {
            initial: {
              isExpanded: false,
              showControls: true,
              controlsDisplay: 'reactive' as const,
              regionState: {
                left: 'collapsed' as const,
                right: 'hidden' as const,
                top: 'full' as const,
                bottom: 'hidden' as const,
              }
            }
          },
          canvas3d: {
            renderer: {
              backgroundColor: 0xffffff as any
            }
          },
          components: {
            remoteState: 'none' as const
          },
          config: [
            [PluginConfig.Viewport.ShowControls, false] as [typeof PluginConfig.Viewport.ShowControls, boolean],
          ]
        };

        const plugin = await createPluginUI({
          target: molstarDiv,
          render: renderReact18,
          spec: pluginSpec
        });

        if (!isMountedRef.current) {
          plugin.dispose();
          return;
        }

        pluginRef.current = plugin;

        // Set white background
        if (plugin.canvas3d) {
          plugin.canvas3d.setProps({
            renderer: {
              ...plugin.canvas3d.props.renderer,
              backgroundColor: Color(0xffffff),
            },
            transparentBackground: false,
          });
        }

        // Wait for layout to stabilize
        await new Promise(resolve => setTimeout(resolve, 200));

        // Load both structures
        const loadStructure = async (pdbData: string, label: string, format: 'pdb' | 'mmcif') => {
          const dataObj = await plugin.builders.data.rawData({ data: pdbData, label });
          const trajectory = await plugin.builders.structure.parseTrajectory(dataObj, format);
          const model = await plugin.builders.structure.createModel(trajectory);
          // Create structure without automatic representation
          const structure = await plugin.builders.structure.createStructure(model);
          return structure;
        };

        // Load previous structure (reference)
        const prevStructure = await loadStructure(previousPdbData, previousLabel, getFormat(previousFilename));
        // Load current structure (mobile - will be transformed)
        const currStructure = await loadStructure(currentPdbData, currentLabel, getFormat(currentFilename));

        // Get structure data for superposition
        const prevStructData = prevStructure.cell?.obj?.data;
        const currStructData = currStructure.cell?.obj?.data;

        if (prevStructData && currStructData) {
          try {
            // Build query for C-alpha atoms (trace atoms for alignment)
            const caQuery = compile(MS.struct.generator.atomGroups({
              'atom-test': MS.core.rel.eq([MS.struct.atomProperty.macromolecular.label_atom_id(), 'CA'])
            }));

            // Get C-alpha selections for both structures
            const prevSel = StructureSelection.toLociWithCurrentUnits(caQuery(new QueryContext(prevStructData)));
            const currSel = StructureSelection.toLociWithCurrentUnits(caQuery(new QueryContext(currStructData)));

            // Perform sequence-aligned superposition
            const transforms = alignAndSuperpose([prevSel, currSel]);

            if (transforms.length > 0) {
              const { bTransform, rmsd } = transforms[0];

              // Apply transformation to current structure
              const builder = plugin.state.data.build().to(currStructure)
                .insert(StateTransforms.Model.TransformStructureConformation, {
                  transform: { name: 'matrix', params: { data: bTransform, transpose: false } }
                });
              await plugin.runTask(plugin.state.data.updateTree(builder));

              // Store RMSD info
              setSuperpositionInfo({
                rmsd: rmsd,
                alignedLength: StructureElement.Loci.size(prevSel)
              });
            }
          } catch (superErr) {
            console.warn('Superposition failed, showing structures without alignment:', superErr);
          }
        }

        // Clear all existing representations using plugin.clear() alternative
        // We'll use plugin managers to remove all components from structures
        try {
          // Simply clear all representations by removing components
          const structures = plugin.managers.structure.hierarchy.current.structures;
          for (const structure of structures) {
            for (const component of structure.components) {
              // Use generic removal that accepts any cell-like reference
              const reprCells = component.representations.map((r: any) => r.cell);
              if (reprCells.length > 0) {
                await plugin.managers.structure.component.removeRepresentations(reprCells);
              }
            }
          }
        } catch (e) {
          // Ignore cleanup errors, we'll add new representations anyway
          console.warn('Failed to clear representations:', e);
        }

        // Add representations with different colors
        // Previous structure - Blue
        const prevPolymer = await plugin.builders.structure.tryCreateComponentStatic(
          prevStructure,
          'polymer'
        );
        if (prevPolymer) {
          await plugin.builders.structure.representation.addRepresentation(
            prevPolymer,
            { type: 'cartoon', color: 'uniform', colorParams: { value: PREVIOUS_COLOR } }
          );
        }

        // Current structure - Red
        const currPolymer = await plugin.builders.structure.tryCreateComponentStatic(
          currStructure,
          'polymer'
        );
        if (currPolymer) {
          await plugin.builders.structure.representation.addRepresentation(
            currPolymer,
            { type: 'cartoon', color: 'uniform', colorParams: { value: CURRENT_COLOR } }
          );
        }

        // Reset camera
        await PluginCommands.Camera.Reset(plugin, {});

        // Apply zoom
        await new Promise(resolve => requestAnimationFrame(resolve));
        const camera = plugin.canvas3d?.camera;
        if (camera) {
          const snapshot = camera.getSnapshot();
          await PluginCommands.Camera.SetSnapshot(plugin, {
            snapshot: {
              ...snapshot,
              radius: snapshot.radius * 0.7,
            },
            durationMs: 0
          });
        }

        setIsLoading(false);
      } catch (err) {
        console.error('Failed to initialize superposed viewer:', err);
        setError('Failed to load superposition view');
        setIsLoading(false);
      }
    };

    initAndLoad();

    return () => {
      isMountedRef.current = false;
      if (pluginRef.current) {
        try {
          pluginRef.current.dispose();
        } catch (e) {
          // Ignore
        }
        pluginRef.current = null;
      }
    };
  }, [previousPdbData, currentPdbData, previousLabel, currentLabel]);

  // Handle reset camera event
  useEffect(() => {
    const handleReset = async () => {
      const plugin = pluginRef.current;
      if (!plugin?.canvas3d) return;

      try {
        const commands = await import('molstar/lib/mol-plugin/commands');
        await commands.PluginCommands.Camera.Reset(plugin, {});
      } catch (e) {
        plugin.canvas3d.requestCameraReset();
      }
    };

    window.addEventListener('compare-overlay-reset-camera', handleReset);
    return () => window.removeEventListener('compare-overlay-reset-camera', handleReset);
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Legend bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-cf-border bg-cf-bg-tertiary">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: `#3498db` }} />
            <span className="text-xs text-cf-text-secondary">{previousLabel} (Previous)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: `#e74c3c` }} />
            <span className="text-xs text-cf-text-secondary">{currentLabel} (Current)</span>
          </div>
        </div>
        {superpositionInfo && (
          <div className="text-xs text-cf-text-muted">
            RMSD: {superpositionInfo.rmsd.toFixed(2)} Å • {superpositionInfo.alignedLength} aligned atoms
          </div>
        )}
      </div>

      {/* Viewer container */}
      <div className="flex-1 relative">
        <div ref={containerRef} className="absolute inset-0" />

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-cf-bg z-10">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 text-cf-accent animate-spin" />
              <span className="text-sm text-cf-text-secondary">Superimposing structures...</span>
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-cf-bg">
            <div className="text-center text-cf-text-secondary">
              <p className="text-cf-error mb-2">{error}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
