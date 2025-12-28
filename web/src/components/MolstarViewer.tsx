'use client';

import { useEffect, useRef, useCallback, useState, useLayoutEffect, memo, forwardRef, useImperativeHandle } from 'react';
import { useAppStore } from '@/lib/store';
import { AtomInfo } from '@/lib/types';
import { Loader2, AlertCircle, Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { useCameraSync, useCameraSyncReset } from '@/hooks/useCameraSync';

// Representation types for structure visualization
export type RepresentationType = 'cartoon' | 'surface' | 'ball-and-stick';

// Ref interface for imperative control of MolstarViewer
export interface MolstarViewerRef {
  resetView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setRepresentation: (rep: RepresentationType) => Promise<void>;
}

// Residue information in selection
export interface ResidueInfo {
  chainId: string;
  residueId: number;
  residueName: string;
  labelSeqId: number;
  insertionCode: string | null;
}

// Selection information from sequence selection
export interface SelectionInfo {
  totalElements: number;
  stats: unknown;
  selections: Array<{
    structureRef: string;
    chainId: string;
    startResidueId: number;
    endResidueId: number;
    residueCount: number;
    sequence: string;
    oneLetterSequence: string;
    residues: ResidueInfo[];
    rangeLabel: string;
  }>;
}

interface MolstarViewerProps {
  tabId: string;
  pdbData?: string;
  pdbUrl?: string;
  format?: 'pdb' | 'mmcif' | 'cif';
  structureId: string;
  showControls?: boolean;
  minimalUI?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onAtomClick?: (atomInfo: AtomInfo) => void;
  onSelectionChange?: (selectionInfo: SelectionInfo | null) => void;
  onAtomCountChange?: (count: number) => void;
  /** Camera sync group ID - viewers with same ID will sync camera */
  syncGroupId?: string | null;
  /** Whether camera sync is enabled */
  syncEnabled?: boolean;
}

// Type definitions for Mol* (using any for compatibility)
type MolstarPlugin = any;
type StructureElementModule = any;
type PluginCommandsModule = any;
type ColorModule = any;
type AssetModule = any;
type PluginConfigModule = any;

// ============================================================================
// Global Molstar Module Cache (Singleton Pattern)
// Loads modules once and reuses across all viewer instances for better performance
// ============================================================================
interface MolstarModules {
  createPluginUI: any;
  renderReact18: any;
  DefaultPluginUISpec: any;
  PluginCommands: any;
  PluginConfig: any;
  Asset: any;
  Color: any;
  StructureElement: any;
}

let molstarModulesPromise: Promise<MolstarModules> | null = null;
let molstarModules: MolstarModules | null = null;

async function loadMolstarModules(): Promise<MolstarModules> {
  // Return cached modules if already loaded
  if (molstarModules) return molstarModules;

  // Return existing promise if loading is in progress
  if (molstarModulesPromise) return molstarModulesPromise;

  // Start loading modules in parallel
  molstarModulesPromise = (async () => {
    if (typeof window === 'undefined') {
      throw new Error('Molstar can only be loaded in browser environment');
    }

    // Load CSS from CDN to avoid SCSS compilation issues
    if (!document.getElementById('molstar-theme-css')) {
      const link = document.createElement('link');
      link.id = 'molstar-theme-css';
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/molstar@latest/build/viewer/molstar.css';
      document.head.appendChild(link);
    }

    // Parallel loading of all required modules
    const [
      pluginUI,
      react18,
      spec,
      commands,
      config,
      assets,
      color,
      structureElement
    ] = await Promise.all([
      import('molstar/lib/mol-plugin-ui'),
      import('molstar/lib/mol-plugin-ui/react18'),
      import('molstar/lib/mol-plugin-ui/spec'),
      import('molstar/lib/mol-plugin/commands'),
      import('molstar/lib/mol-plugin/config'),
      import('molstar/lib/mol-util/assets'),
      import('molstar/lib/mol-util/color'),
      import('molstar/lib/mol-model/structure')
    ]);

    molstarModules = {
      createPluginUI: pluginUI.createPluginUI,
      renderReact18: react18.renderReact18,
      DefaultPluginUISpec: spec.DefaultPluginUISpec,
      PluginCommands: commands.PluginCommands,
      PluginConfig: config.PluginConfig,
      Asset: assets.Asset,
      Color: color.Color,
      StructureElement: structureElement.StructureElement
    };

    return molstarModules;
  })();

  return molstarModulesPromise;
}

// Three-letter to one-letter amino acid conversion table
const threeToOne: Record<string, string> = {
  'ALA': 'A', 'ARG': 'R', 'ASN': 'N', 'ASP': 'D',
  'CYS': 'C', 'GLN': 'Q', 'GLU': 'E', 'GLY': 'G',
  'HIS': 'H', 'ILE': 'I', 'LEU': 'L', 'LYS': 'K',
  'MET': 'M', 'PHE': 'F', 'PRO': 'P', 'SER': 'S',
  'THR': 'T', 'TRP': 'W', 'TYR': 'Y', 'VAL': 'V',
  // Non-standard
  'SEC': 'U', 'PYL': 'O',
  // Nucleic acids
  'A': 'A', 'C': 'C', 'G': 'G', 'U': 'U', 'T': 'T',
  'DA': 'A', 'DC': 'C', 'DG': 'G', 'DT': 'T'
};

// Helper function to extract atom information from a location
function extractAtomInfo(location: any, position: number[] | null): AtomInfo | null {
  if (!location) return null;

  const { unit, element } = location;
  const model = unit.model;
  const hierarchy = model.atomicHierarchy;
  const conformation = model.atomicConformation;

  // Get indices
  const residueIndex = unit.residueIndex[element];
  const chainIndex = unit.chainIndex[element];

  return {
    // Atom info
    element: hierarchy.atoms.type_symbol.value(element),
    atomName: hierarchy.atoms.label_atom_id.value(element),
    altId: hierarchy.atoms.label_alt_id.value(element) || null,
    charge: hierarchy.atoms.pdbx_formal_charge.value(element),

    // Residue info
    residueName: hierarchy.atoms.label_comp_id.value(element),
    residueId: hierarchy.residues.label_seq_id.value(residueIndex),
    authResidueId: hierarchy.residues.auth_seq_id.value(residueIndex),
    insertionCode: hierarchy.residues.pdbx_PDB_ins_code.value(residueIndex) || null,
    isHetAtom: hierarchy.residues.group_PDB.value(residueIndex) === 'HETATM',

    // Chain info
    chainId: hierarchy.chains.label_asym_id.value(chainIndex),
    authChainId: hierarchy.chains.auth_asym_id.value(chainIndex),
    entityId: hierarchy.chains.label_entity_id.value(chainIndex),

    // Coordinates (Å)
    coordinates: {
      x: conformation.x[element],
      y: conformation.y[element],
      z: conformation.z[element]
    },

    // Physical properties
    bFactor: conformation.B_iso_or_equiv.value(element),
    occupancy: conformation.occupancy.value(element),

    // 3D click position
    clickPosition: position ? {
      x: position[0],
      y: position[1],
      z: position[2]
    } : null,

    // Label for display
    label: `${hierarchy.chains.auth_asym_id.value(chainIndex)}:${hierarchy.atoms.label_comp_id.value(element)}${hierarchy.residues.auth_seq_id.value(residueIndex)}:${hierarchy.atoms.label_atom_id.value(element)}`
  };
}

// Helper function to extract selection information (for sequence selection)
function extractSelectionInfo(plugin: MolstarPlugin, StructureElement: StructureElementModule): SelectionInfo | null {
  if (!StructureElement) return null;

  const selectionManager = plugin.managers.structure.selection;
  const entries = selectionManager.entries;

  const selections: SelectionInfo['selections'] = [];

  entries.forEach((entry: any, ref: string) => {
    const loci = entry.selection;
    if (!StructureElement.Loci.is(loci) || StructureElement.Loci.isEmpty(loci)) {
      return;
    }

    // Collect all selected residue information
    const residues = new Map<string, ResidueInfo>();

    StructureElement.Loci.forEachLocation(loci, (location: any) => {
      const { unit, element } = location;
      const model = unit.model;
      const hierarchy = model.atomicHierarchy;

      const residueIndex = unit.residueIndex[element];
      const chainIndex = unit.chainIndex[element];

      // Create unique residue key
      const chainId = hierarchy.chains.auth_asym_id.value(chainIndex);
      const seqId = hierarchy.residues.auth_seq_id.value(residueIndex);
      const residueKey = `${chainId}:${seqId}`;

      if (!residues.has(residueKey)) {
        residues.set(residueKey, {
          chainId: chainId,
          residueId: seqId,
          residueName: hierarchy.atoms.label_comp_id.value(element),
          labelSeqId: hierarchy.residues.label_seq_id.value(residueIndex),
          insertionCode: hierarchy.residues.pdbx_PDB_ins_code.value(residueIndex) || null,
        });
      }
    });

    // Convert to sorted array
    const residueList = Array.from(residues.values())
      .sort((a, b) => {
        if (a.chainId !== b.chainId) return a.chainId.localeCompare(b.chainId);
        return a.residueId - b.residueId;
      });

    // Calculate range
    if (residueList.length > 0) {
      const firstResidue = residueList[0];
      const lastResidue = residueList[residueList.length - 1];

      selections.push({
        structureRef: ref,
        chainId: firstResidue.chainId,
        startResidueId: firstResidue.residueId,
        endResidueId: lastResidue.residueId,
        residueCount: residueList.length,
        sequence: residueList.map(r => r.residueName).join('-'),
        oneLetterSequence: residueList.map(r => threeToOne[r.residueName] || 'X').join(''),
        residues: residueList,
        // Range label for display
        rangeLabel: `${firstResidue.chainId}:${firstResidue.residueId}-${lastResidue.residueId}`
      });
    }
  });

  if (selections.length === 0) return null;

  return {
    totalElements: selectionManager.elementCount(),
    stats: selectionManager.stats,
    selections: selections
  };
}

// Utility function to adjust color brightness
function adjustColor(color: string, amount: number): string {
  const hex = color.replace('#', '');
  const r = Math.max(0, Math.min(255, parseInt(hex.slice(0, 2), 16) + amount));
  const g = Math.max(0, Math.min(255, parseInt(hex.slice(2, 4), 16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(hex.slice(4, 6), 16) + amount));
  return `rgb(${r}, ${g}, ${b})`;
}

export const MolstarViewer = memo(forwardRef<MolstarViewerRef, MolstarViewerProps>(function MolstarViewer({
  tabId,
  pdbData,
  pdbUrl,
  format = 'pdb',
  structureId,
  showControls = true,
  minimalUI = false,
  isExpanded = false,
  onToggleExpand,
  onAtomClick,
  onSelectionChange,
  onAtomCountChange,
  syncGroupId = null,
  syncEnabled = false,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const molstarContainerRef = useRef<HTMLDivElement | null>(null);
  const pluginRef = useRef<MolstarPlugin | null>(null);
  const structureElementRef = useRef<StructureElementModule | null>(null);
  const pluginCommandsRef = useRef<PluginCommandsModule | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const setThumbnail = useAppStore(state => state.setThumbnail);
  const setMolstarExpanded = useAppStore(state => state.setMolstarExpanded);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const isMountedRef = useRef(true);
  const [useFallback, setUseFallback] = useState(false);
  const [pluginReady, setPluginReady] = useState(false);
  const resetViewRef = useRef<() => void>(() => {});

  // Camera sync hook for synchronizing views across multiple viewers
  useCameraSync(tabId, syncGroupId, syncEnabled && pluginReady, pluginRef);

  // Handle sync group camera reset (uses ref to avoid circular dependency)
  useCameraSyncReset(syncGroupId, useCallback(() => resetViewRef.current?.(), []));

  // Parse PDB to count atoms (for display purposes)
  const parseAtomCount = useCallback((pdb: string): number => {
    const lines = pdb.split('\n');
    let count = 0;
    for (const line of lines) {
      if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
        count++;
      }
    }
    return count;
  }, []);

  // Safely dispose plugin
  const disposePlugin = useCallback(() => {
    if (pluginRef.current) {
      try {
        pluginRef.current.dispose();
      } catch (e) {
        console.warn('Error disposing molstar plugin:', e);
      }
      pluginRef.current = null;
    }
    // Remove molstar container if it exists
    if (molstarContainerRef.current && molstarContainerRef.current.parentNode) {
      try {
        molstarContainerRef.current.parentNode.removeChild(molstarContainerRef.current);
      } catch (e) {
        console.warn('Error removing molstar container:', e);
      }
      molstarContainerRef.current = null;
    }
  }, []);

  // Initialize Mol* viewer
  const initViewer = useCallback(async () => {
    if (!containerRef.current || initPromiseRef.current || !isMountedRef.current) return;

    setIsLoading(true);
    setError(null);

    initPromiseRef.current = (async () => {
      try {
        // Use global module cache for better performance across multiple instances
        const modules = await loadMolstarModules();
        const {
          createPluginUI,
          renderReact18,
          DefaultPluginUISpec,
          PluginConfig,
          Color,
          StructureElement,
          PluginCommands
        } = modules;

        // Store modules for later use
        structureElementRef.current = StructureElement;
        pluginCommandsRef.current = PluginCommands;

        // Cleanup any existing plugin
        disposePlugin();

        if (!isMountedRef.current || !containerRef.current) return;

        // Clear any existing content (including fallback canvas)
        containerRef.current.innerHTML = '';

        // Create a separate div for molstar (not managed by React)
        // Use percentage-based sizing initially to ensure proper layout
        // The resize handler will update to pixel dimensions once the container is laid out
        const molstarDiv = document.createElement('div');
        molstarDiv.style.width = '100%';
        molstarDiv.style.height = '100%';
        molstarDiv.style.position = 'absolute';
        molstarDiv.style.top = '0';
        molstarDiv.style.left = '0';
        containerRef.current.appendChild(molstarDiv);
        molstarContainerRef.current = molstarDiv;

        // Create plugin with minimal or full UI based on prop
        // For minimalUI: hide all panels completely (used in timeline previews)
        // For full UI: show sequence panel at top, collapsed panels on sides
        const spec = minimalUI ? {
          ...DefaultPluginUISpec(),
          layout: {
            initial: {
              isExpanded: false,
              showControls: false,
              controlsDisplay: 'reactive' as const,
              regionState: {
                left: 'hidden' as const,
                right: 'hidden' as const,
                top: 'hidden' as const,
                bottom: 'hidden' as const,
              }
            }
          },
          canvas3d: {
            renderer: {
              backgroundColor: 0xffffff as any // White background
            }
          },
          components: {
            remoteState: 'none' as const
          },
          config: [
            // Hide ALL built-in viewport controls for minimal UI (timeline previews)
            [PluginConfig.Viewport.ShowControls, false] as [typeof PluginConfig.Viewport.ShowControls, boolean],
            [PluginConfig.Viewport.ShowExpand, false] as [typeof PluginConfig.Viewport.ShowExpand, boolean],
            [PluginConfig.Viewport.ShowAnimation, false] as [typeof PluginConfig.Viewport.ShowAnimation, boolean],
            [PluginConfig.Viewport.ShowSettings, false] as [typeof PluginConfig.Viewport.ShowSettings, boolean],
            [PluginConfig.Viewport.ShowSelectionMode, false] as [typeof PluginConfig.Viewport.ShowSelectionMode, boolean],
            [PluginConfig.Viewport.ShowTrackball, false] as [typeof PluginConfig.Viewport.ShowTrackball, boolean],
          ]
        } : {
          ...DefaultPluginUISpec(),
          layout: {
            initial: {
              isExpanded: false,
              showControls: true,
              controlsDisplay: 'reactive' as const,
              // Full UI configuration with sequence panel and structure tools
              // Note: left supports 'full'/'collapsed'/'hidden', but top/right/bottom only support 'full'/'hidden'
              regionState: {
                left: 'collapsed' as const,    // State Tree - collapsed
                right: 'hidden' as const,      // Structure Tools - hidden by default
                top: 'full' as const,          // Sequence View - visible
                bottom: 'hidden' as const,     // Log panel - hidden
              }
            }
          },
          canvas3d: {
            renderer: {
              backgroundColor: 0xffffff as any // White background
            }
          },
          components: {
            remoteState: 'none' as const
          },
          config: [
            // Hide built-in viewport controls to avoid overlap with our custom toolbar
            [PluginConfig.Viewport.ShowControls, false] as [typeof PluginConfig.Viewport.ShowControls, boolean],
          ]
        };

        const plugin = await createPluginUI({
          target: molstarDiv,
          render: renderReact18,
          spec
        });

        if (!isMountedRef.current) {
          plugin.dispose();
          return;
        }

        pluginRef.current = plugin as MolstarPlugin;

        // Set white background color after plugin is ready
        if (plugin.canvas3d) {
          plugin.canvas3d.setProps({
            renderer: {
              ...plugin.canvas3d.props.renderer,
              backgroundColor: Color(0xffffff),
            },
            transparentBackground: false,
          });
        }

        // CRITICAL: Wait for Mol*'s internal React layout to fully render before loading structure
        // When panels are 'collapsed', Mol* creates a complex React UI that needs time to mount
        // We need to wait for BOTH the canvas AND the collapsed panel elements to be ready
        await new Promise<void>((resolve) => {
          let frameCount = 0;
          const maxFrames = 60; // ~1 second at 60fps - longer wait for collapsed panels

          const waitForLayout = () => {
            if (!isMountedRef.current || !plugin.canvas3d) {
              resolve();
              return;
            }

            // Check if Mol*'s canvas element has valid dimensions
            const canvas = molstarDiv.querySelector('canvas');
            // Also check if the msp-plugin container has stabilized (for collapsed panels)
            const mspPlugin = molstarDiv.querySelector('.msp-plugin');

            if (canvas && mspPlugin) {
              const canvasRect = canvas.getBoundingClientRect();
              const pluginRect = mspPlugin.getBoundingClientRect();

              // Canvas should have valid dimensions AND be within the plugin container
              if (canvasRect.width > 10 && canvasRect.height > 10 &&
                  pluginRect.width > 10 && pluginRect.height > 10) {
                // Multiple resize calls to ensure dimensions are correct
                plugin.canvas3d.handleResize();
                // Wait one more frame then resolve
                requestAnimationFrame(() => {
                  plugin.canvas3d?.handleResize();
                  resolve();
                });
                return;
              }
            }

            // Keep waiting up to maxFrames
            frameCount++;
            if (frameCount >= maxFrames) {
              // Timeout - try resize anyway
              plugin.canvas3d.handleResize();
              resolve();
              return;
            }

            requestAnimationFrame(waitForLayout);
          };

          requestAnimationFrame(waitForLayout);
        });

        // Mark plugin as ready to trigger dependent effects
        setPluginReady(true);
      } catch (err) {
        console.error('Failed to initialize Mol* viewer:', err);
        if (isMountedRef.current) {
          setError('Failed to initialize 3D viewer. Using fallback renderer.');
        }
        throw err;
      }
    })();

    try {
      await initPromiseRef.current;
    } finally {
      initPromiseRef.current = null;
    }
  }, [disposePlugin]);

  // Load structure into viewer
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loadStructure = useCallback(async () => {
    // If no data provided, nothing to load
    if (!pdbData && !pdbUrl) {
      setIsLoading(false);
      return;
    }

    // If Molstar plugin not ready yet, just wait (don't trigger fallback)
    // The fallback should only be used when Molstar initialization FAILS
    if (!pluginRef.current) {
      return;
    }

    try {
      setIsLoading(true);
      const plugin = pluginRef.current;

      // Clear existing structures
      await plugin.clear();

      // Get cached modules
      const modules = await loadMolstarModules();
      const { Color, Asset } = modules;

      // Ensure canvas has valid dimensions before loading structure
      if (plugin.canvas3d) {
        plugin.canvas3d.setProps({
          renderer: {
            ...plugin.canvas3d.props.renderer,
            backgroundColor: Color(0xffffff),
          },
          transparentBackground: false,
        });

        // Force resize to ensure canvas has correct dimensions
        plugin.canvas3d.handleResize();
      }

      // Load PDB data from URL or raw data
      let dataObj;
      if (pdbUrl) {
        dataObj = await plugin.builders.data.download(
          { url: Asset.Url(pdbUrl), isBinary: false },
          { state: { isGhost: true } }
        );
      } else if (pdbData) {
        dataObj = await plugin.builders.data.rawData({ data: pdbData, label: structureId });
      } else {
        return;
      }

      const trajectory = await plugin.builders.structure.parseTrajectory(dataObj, format);

      // Build model and structure manually for more control
      // Use 'empty' preset to prevent default representation from being added
      // This avoids the visual "flash" from default ball-and-stick to cartoon
      const model = await plugin.builders.structure.createModel(trajectory);
      const structure = await plugin.builders.structure.createStructure(model, {
        representationPreset: 'empty'
      });

      // Add cartoon representation with sequence-id coloring (rainbow gradient along chain)
      const cartoonComponent = await plugin.builders.structure.tryCreateComponentStatic(
        structure,
        'polymer'
      );

      if (cartoonComponent) {
        await plugin.builders.structure.representation.addRepresentation(
          cartoonComponent,
          {
            type: 'cartoon',
            color: 'sequence-id'
          }
        );
      }

      // Also add ball-and-stick for ligands if any
      const ligandComponent = await plugin.builders.structure.tryCreateComponentStatic(
        structure,
        'ligand'
      );

      if (ligandComponent) {
        await plugin.builders.structure.representation.addRepresentation(
          ligandComponent,
          {
            type: 'ball-and-stick',
            color: 'element-symbol'
          }
        );
      }

      // Reset camera to fit structure after it loads with zoom and tilt
      // Use Mol*'s PluginCommands for reliable centering, then apply custom view
      const resetCamera = async () => {
        const plugin = pluginRef.current;
        if (!plugin?.canvas3d) return;

        // First ensure the canvas knows its current size
        plugin.canvas3d.handleResize();

        // Force a draw to ensure the canvas renders
        plugin.canvas3d.requestDraw(true);

        try {
          // Use cached PluginCommands for proper centering
          const modules = await loadMolstarModules();
          await modules.PluginCommands.Camera.Reset(plugin, {});

          // Apply zoom and tilt after reset
          // Wait a frame for the reset to complete
          await new Promise(resolve => requestAnimationFrame(resolve));

          const camera = plugin.canvas3d.camera;
          if (camera) {
            const snapshot = camera.getSnapshot();

            // Calculate tilted rotation (approximately 20 degrees tilt)
            // Original up vector is [0,1,0], we rotate it to create a slight tilt
            const tiltAngle = Math.PI / 9; // ~20 degrees
            const rotationAngle = Math.PI / 12; // ~15 degrees horizontal rotation

            // Apply tilted view by modifying the camera snapshot
            // Zoom in by reducing radius to 70% of auto-fit distance
            const zoomFactor = 0.7;

            await modules.PluginCommands.Camera.SetSnapshot(plugin, {
              snapshot: {
                ...snapshot,
                radius: snapshot.radius * zoomFactor,
                // Apply rotation to create tilted perspective
                // Rotate the up vector slightly for visual tilt effect
                up: [
                  Math.sin(rotationAngle) * Math.sin(tiltAngle),
                  Math.cos(tiltAngle),
                  Math.cos(rotationAngle) * Math.sin(tiltAngle)
                ] as [number, number, number]
              },
              durationMs: 0 // Instant transition
            });
          }
        } catch (e) {
          console.warn('Camera reset via PluginCommands failed:', e);
          // Fallback to canvas3d methods
          try {
            if (typeof plugin.canvas3d.resetCamera === 'function') {
              plugin.canvas3d.resetCamera();
            } else {
              plugin.canvas3d.requestCameraReset();
            }
          } catch (e2) {
            plugin.canvas3d.requestCameraReset();
          }
        }

        // Force another draw after camera reset
        plugin.canvas3d.requestDraw(true);
      };

      // Series of resets to ensure proper centering as layout settles
      // Use more aggressive timing for initial renders
      const resetDelays = [50, 150, 300, 500, 800, 1200];
      resetDelays.forEach((delay) => {
        setTimeout(resetCamera, delay);
      });

      // Count atoms and notify parent
      if (pdbData) {
        onAtomCountChange?.(parseAtomCount(pdbData));
      }

      // For non-minimal UI, ensure canvas is properly sized after structure loads
      // Panels are already 'collapsed' from initialization (user requirement)
      if (!minimalUI && plugin.canvas3d) {
        // Extra resize and camera reset sequence for collapsed panel layout
        setTimeout(() => {
          if (plugin.canvas3d) {
            plugin.canvas3d.handleResize();
            plugin.canvas3d.requestDraw(true);
            resetCamera();
          }
        }, 300);
      }

      // Generate thumbnail after a short delay
      setTimeout(() => {
        generateThumbnail();
      }, 500);

      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load structure:', err);
      setError('Failed to load structure. Using fallback renderer.');
      renderFallback();
    }
  }, [pdbData, structureId, parseAtomCount, minimalUI]);

  // Generate thumbnail from canvas
  const generateThumbnail = useCallback(() => {
    if (!containerRef.current) return;

    const canvas = containerRef.current.querySelector('canvas');
    if (canvas) {
      try {
        const thumbnail = canvas.toDataURL('image/png', 0.5);
        setThumbnail(structureId, thumbnail);
      } catch (e) {
        console.warn('Failed to generate thumbnail:', e);
      }
    }
  }, [structureId, setThumbnail]);

  // Fallback Canvas 2D renderer when Mol* fails
  const renderFallback = useCallback(() => {
    if (!containerRef.current || !pdbData) return;

    // Clear container and create canvas
    containerRef.current.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    containerRef.current.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError('Canvas not supported');
      setIsLoading(false);
      return;
    }

    // Set canvas size
    const rect = containerRef.current.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Parse PDB coordinates - use local variable, not global
    const atoms: { x: number; y: number; z: number; element: string }[] = [];
    const lines = pdbData.split('\n');

    for (const line of lines) {
      if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
        const x = parseFloat(line.slice(30, 38));
        const y = parseFloat(line.slice(38, 46));
        const z = parseFloat(line.slice(46, 54));
        const element = line.slice(76, 78).trim() || line.slice(12, 14).trim()[0];

        if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
          atoms.push({ x, y, z, element });
        }
      }
    }

    onAtomCountChange?.(atoms.length);

    if (atoms.length === 0) {
      setError('No atoms found in PDB data');
      setIsLoading(false);
      return;
    }

    // Calculate bounds
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (const atom of atoms) {
      minX = Math.min(minX, atom.x);
      maxX = Math.max(maxX, atom.x);
      minY = Math.min(minY, atom.y);
      maxY = Math.max(maxY, atom.y);
      minZ = Math.min(minZ, atom.z);
      maxZ = Math.max(maxZ, atom.z);
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const range = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
    const scale = Math.min(rect.width, rect.height) * 0.8 / range;

    // Clear canvas with white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Element colors
    const elementColors: Record<string, string> = {
      'C': '#909090', 'N': '#3050F8', 'O': '#FF0D0D',
      'S': '#FFFF30', 'H': '#FFFFFF', 'P': '#FF8000',
    };

    // Sort atoms by Z for depth
    const sortedAtoms = [...atoms].sort((a, b) => a.z - b.z);

    // Draw bonds (simplified)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;

    for (let i = 0; i < atoms.length - 1; i++) {
      const a1 = atoms[i];
      const a2 = atoms[i + 1];
      const dist = Math.sqrt(
        Math.pow(a2.x - a1.x, 2) +
        Math.pow(a2.y - a1.y, 2) +
        Math.pow(a2.z - a1.z, 2)
      );

      if (dist < 2.0) {
        const x1 = (a1.x - centerX) * scale + rect.width / 2;
        const y1 = (a1.y - centerY) * scale + rect.height / 2;
        const x2 = (a2.x - centerX) * scale + rect.width / 2;
        const y2 = (a2.y - centerY) * scale + rect.height / 2;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }

    // Draw atoms
    for (const atom of sortedAtoms) {
      const x = (atom.x - centerX) * scale + rect.width / 2;
      const y = (atom.y - centerY) * scale + rect.height / 2;
      const depth = (atom.z - minZ) / (maxZ - minZ || 1);
      const radius = Math.max(1, (2 + depth * 2) * (scale / 10));

      const color = elementColors[atom.element] || '#FF1493';

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);

      const gradient = ctx.createRadialGradient(
        x - radius * 0.3, y - radius * 0.3, 0,
        x, y, radius
      );
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, adjustColor(color, -50));
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // Generate thumbnail
    const thumbnail = canvas.toDataURL('image/png', 0.5);
    setThumbnail(structureId, thumbnail);

    setIsLoading(false);
  }, [pdbData, structureId, setThumbnail]);

  // Memoized control handlers - use pre-loaded PluginCommands
  const handleResetView = useCallback(async () => {
    const plugin = pluginRef.current;
    if (!plugin?.canvas3d) return;

    plugin.canvas3d.handleResize();

    // Use pre-loaded PluginCommands for reliable reset
    const PluginCommands = pluginCommandsRef.current;
    if (PluginCommands) {
      try {
        await PluginCommands.Camera.Reset(plugin, {});

        // Apply zoom and tilt after reset
        await new Promise(resolve => requestAnimationFrame(resolve));

        const camera = plugin.canvas3d.camera;
        if (camera) {
          const snapshot = camera.getSnapshot();
          const tiltAngle = Math.PI / 9; // ~20 degrees
          const rotationAngle = Math.PI / 12; // ~15 degrees horizontal rotation
          const zoomFactor = 0.7;

          await PluginCommands.Camera.SetSnapshot(plugin, {
            snapshot: {
              ...snapshot,
              radius: snapshot.radius * zoomFactor,
              up: [
                Math.sin(rotationAngle) * Math.sin(tiltAngle),
                Math.cos(tiltAngle),
                Math.cos(rotationAngle) * Math.sin(tiltAngle)
              ] as [number, number, number]
            },
            durationMs: 0
          });
        }
      } catch (e) {
        plugin.canvas3d.requestCameraReset();
      }
    } else {
      plugin.canvas3d.requestCameraReset();
    }
  }, []);

  // Update ref for camera sync reset callback
  useEffect(() => {
    resetViewRef.current = handleResetView;
  }, [handleResetView]);

  const handleZoomIn = useCallback(() => {
    if (pluginRef.current?.canvas3d && pluginCommandsRef.current) {
      const camera = pluginRef.current.canvas3d.camera;
      pluginCommandsRef.current.Camera.SetSnapshot(pluginRef.current, {
        snapshot: {
          ...camera.getSnapshot(),
          radius: camera.getSnapshot().radius * 0.8
        }
      });
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (pluginRef.current?.canvas3d && pluginCommandsRef.current) {
      const camera = pluginRef.current.canvas3d.camera;
      pluginCommandsRef.current.Camera.SetSnapshot(pluginRef.current, {
        snapshot: {
          ...camera.getSnapshot(),
          radius: camera.getSnapshot().radius * 1.2
        }
      });
    }
  }, []);

  // Change structure representation (cartoon, surface, ball-and-stick)
  const setRepresentation = useCallback(async (rep: RepresentationType) => {
    const plugin = pluginRef.current;
    if (!plugin) return;

    try {
      // Get all structures in the plugin
      const structures = plugin.managers.structure.hierarchy.current.structures;

      for (const structure of structures) {
        // Get components for this structure
        const components = structure.components;

        // Remove all existing representations
        for (const component of components) {
          for (const repr of component.representations) {
            await plugin.managers.structure.component.removeRepresentations([repr.cell]);
          }
        }
      }

      // Get the root structure reference
      const structureRef = plugin.managers.structure.hierarchy.current.structures[0]?.cell;
      if (!structureRef) return;

      // Create polymer component and add new representation
      const polymerComponent = await plugin.builders.structure.tryCreateComponentStatic(
        structureRef,
        'polymer'
      );

      if (polymerComponent) {
        if (rep === 'cartoon') {
          await plugin.builders.structure.representation.addRepresentation(
            polymerComponent,
            { type: 'cartoon', color: 'sequence-id' }
          );
        } else if (rep === 'surface') {
          await plugin.builders.structure.representation.addRepresentation(
            polymerComponent,
            { type: 'molecular-surface', color: 'sequence-id' }
          );
        } else if (rep === 'ball-and-stick') {
          await plugin.builders.structure.representation.addRepresentation(
            polymerComponent,
            { type: 'ball-and-stick', color: 'element-symbol' }
          );
        }
      }

      // Also handle ligands
      const ligandComponent = await plugin.builders.structure.tryCreateComponentStatic(
        structureRef,
        'ligand'
      );

      if (ligandComponent) {
        await plugin.builders.structure.representation.addRepresentation(
          ligandComponent,
          { type: 'ball-and-stick', color: 'element-symbol' }
        );
      }
    } catch (err) {
      console.error('Failed to change representation:', err);
    }
  }, []);

  // Expose methods via ref for imperative control
  useImperativeHandle(ref, () => ({
    resetView: handleResetView,
    zoomIn: handleZoomIn,
    zoomOut: handleZoomOut,
    setRepresentation,
  }), [handleResetView, handleZoomIn, handleZoomOut, setRepresentation]);

  // Set up click event handling
  useEffect(() => {
    if (!pluginRef.current || !onAtomClick) return;

    const plugin = pluginRef.current;
    const StructureElement = structureElementRef.current;

    if (!StructureElement) return;

    // Subscribe to click events
    const subscription = plugin.behaviors.interaction.click.subscribe(
      ({ current, position }: { current: { loci: unknown }; position: number[] | null }) => {
        try {
          // Check if we clicked on a structure element
          if (StructureElement.Loci.is(current.loci)) {
            // Get the first location from the loci
            const location = StructureElement.Loci.getFirstLocation(current.loci);
            if (location) {
              const atomInfo = extractAtomInfo(location, position);
              if (atomInfo) {
                onAtomClick(atomInfo);
              }
            }
          }
        } catch (err) {
          console.error('Error handling click:', err);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [onAtomClick]);

  // Set up selection change handling (for sequence selection)
  useEffect(() => {
    if (!pluginRef.current || !onSelectionChange) return;

    const plugin = pluginRef.current;
    const StructureElement = structureElementRef.current;

    if (!StructureElement) return;

    // Subscribe to selection change events
    const subscription = plugin.managers.structure.selection.events.changed.subscribe(() => {
      try {
        const selectionInfo = extractSelectionInfo(plugin, StructureElement);
        onSelectionChange(selectionInfo);
      } catch (err) {
        console.error('Error handling selection change:', err);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [onSelectionChange]);

  // Handle reset view event
  useEffect(() => {
    const handleReset = async () => {
      if (useFallback) {
        renderFallback();
        return;
      }

      const plugin = pluginRef.current;
      if (!plugin?.canvas3d) return;

      // Ensure canvas has correct dimensions
      plugin.canvas3d.handleResize();

      try {
        // Use PluginCommands.Camera.Reset for proper camera reset
        const modules = await loadMolstarModules();
        await modules.PluginCommands.Camera.Reset(plugin, {});

        // Apply zoom and tilt after reset
        await new Promise(resolve => requestAnimationFrame(resolve));

        const camera = plugin.canvas3d.camera;
        if (camera) {
          const snapshot = camera.getSnapshot();
          const tiltAngle = Math.PI / 9; // ~20 degrees
          const rotationAngle = Math.PI / 12; // ~15 degrees horizontal rotation
          const zoomFactor = 0.7;

          await modules.PluginCommands.Camera.SetSnapshot(plugin, {
            snapshot: {
              ...snapshot,
              radius: snapshot.radius * zoomFactor,
              up: [
                Math.sin(rotationAngle) * Math.sin(tiltAngle),
                Math.cos(tiltAngle),
                Math.cos(rotationAngle) * Math.sin(tiltAngle)
              ] as [number, number, number]
            },
            durationMs: 0
          });
        }
      } catch (e) {
        console.warn('Camera reset via PluginCommands failed, using fallback:', e);
        // Fallback methods
        try {
          if (typeof plugin.canvas3d.resetCamera === 'function') {
            plugin.canvas3d.resetCamera();
          } else {
            plugin.canvas3d.requestCameraReset();
          }
        } catch (e2) {
          plugin.canvas3d.requestCameraReset();
        }
      }
    };

    window.addEventListener('molstar-reset-view', handleReset);
    return () => window.removeEventListener('molstar-reset-view', handleReset);
  }, [renderFallback, useFallback]);

  // Handle panel toggle event from ViewerToolbar
  useEffect(() => {
    const handleTogglePanel = async (event: CustomEvent<{ panel: string }>) => {
      const plugin = pluginRef.current;
      if (!plugin?.layout) return;

      const { panel } = event.detail;

      try {
        // Get current state of the panel
        const currentState = plugin.layout.state.regionState;
        const panelKey = panel as keyof typeof currentState;
        const currentPanelState = currentState[panelKey];

        // Toggle between 'full' and 'hidden'
        // Note: right/top/bottom only support 'full' or 'hidden', left also supports 'collapsed'
        let newState: string;
        if (panelKey === 'left') {
          // For left panel: cycle through hidden -> collapsed -> full -> hidden
          newState = currentPanelState === 'hidden' ? 'collapsed' :
                     currentPanelState === 'collapsed' ? 'full' : 'hidden';
        } else {
          // For right/top/bottom: toggle between 'full' and 'hidden'
          newState = currentPanelState === 'hidden' ? 'full' : 'hidden';
        }

        // Use PluginCommands.Layout.Update for proper state management
        const modules = await loadMolstarModules();
        await modules.PluginCommands.Layout.Update(plugin, {
          state: {
            regionState: {
              ...currentState,
              [panelKey]: newState
            }
          }
        });

        // Notify ViewerToolbar about the state change
        window.dispatchEvent(new CustomEvent('molstar-panel-state-changed', {
          detail: { panel, visible: newState !== 'hidden' }
        }));
      } catch (e) {
        console.warn('Failed to toggle panel:', e);
      }
    };

    window.addEventListener('molstar-toggle-panel' as any, handleTogglePanel);
    return () => window.removeEventListener('molstar-toggle-panel' as any, handleTogglePanel);
  }, []);

  // Synchronous cleanup before unmount to prevent DOM conflicts
  useLayoutEffect(() => {
    return () => {
      // Mark as unmounted first
      isMountedRef.current = false;
      // Synchronously dispose plugin before React unmounts DOM
      if (pluginRef.current) {
        try {
          pluginRef.current.dispose();
        } catch (e) {
          // Ignore disposal errors during unmount
        }
        pluginRef.current = null;
      }
      // Remove molstar container synchronously
      if (molstarContainerRef.current) {
        try {
          molstarContainerRef.current.remove();
        } catch (e) {
          // Ignore removal errors
        }
        molstarContainerRef.current = null;
      }
    };
  }, []);

  // Initialize viewer on mount
  useEffect(() => {
    isMountedRef.current = true;

    // Wait for container to have valid dimensions before initializing Mol*
    // This is critical for WebGL canvas to initialize correctly
    const waitForDimensionsAndInit = async () => {
      // Check if container has valid dimensions
      const checkDimensions = () => {
        if (!containerRef.current) return false;
        const rect = containerRef.current.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      // If dimensions are already valid, proceed immediately
      if (checkDimensions()) {
        return initViewer().then(() => {
          if (isMountedRef.current) {
            return loadStructure();
          }
        });
      }

      // Otherwise, wait for dimensions using requestAnimationFrame
      // with a timeout to prevent infinite waiting
      await new Promise<void>((resolve) => {
        let attempts = 0;
        const maxAttempts = 100; // ~1.6 seconds at 60fps

        const checkLoop = () => {
          if (!isMountedRef.current) {
            resolve();
            return;
          }
          if (checkDimensions() || attempts >= maxAttempts) {
            resolve();
            return;
          }
          attempts++;
          requestAnimationFrame(checkLoop);
        };
        requestAnimationFrame(checkLoop);
      });

      if (!isMountedRef.current) return;

      return initViewer().then(() => {
        if (isMountedRef.current) {
          return loadStructure();
        }
      });
    };

    // Try Molstar first, fallback to canvas if it fails
    waitForDimensionsAndInit()
      .catch((err) => {
        console.warn('Molstar initialization failed, using fallback:', err);
        if (isMountedRef.current) {
          setUseFallback(true);
          setIsLoading(false);
          renderFallback();
        }
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload structure when pdbData changes
  useEffect(() => {
    if (useFallback) {
      renderFallback();
    } else if (pluginRef.current) {
      loadStructure();
    }
  }, [pdbData, useFallback]); // eslint-disable-line react-hooks/exhaustive-deps

  // Watch for Mol* expanded state changes via MutationObserver
  // This detects when the user clicks Mol*'s built-in "Toggle Expanded Viewport" button
  const lastExpandedRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const checkExpanded = () => {
      // Check if any element has the .msp-layout-expanded class
      const expandedElement = document.querySelector('.msp-layout-expanded');
      const isExpanded = !!expandedElement;

      // Only update state if value actually changed to prevent infinite loop
      if (lastExpandedRef.current !== isExpanded) {
        lastExpandedRef.current = isExpanded;
        setMolstarExpanded(isExpanded);
      }
    };

    // Create observer to watch for class changes in the DOM
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          checkExpanded();
          break;
        }
        // Also check for added/removed nodes (in case the expanded element is added dynamically)
        if (mutation.type === 'childList') {
          checkExpanded();
          break;
        }
      }
    });

    // Observe the entire document for class changes
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
      subtree: true,
      childList: true
    });

    // Initial check
    checkExpanded();

    return () => {
      observer.disconnect();
      // Reset expanded state when component unmounts
      setMolstarExpanded(false);
    };
  }, [setMolstarExpanded]);

  // Handle resize
  useEffect(() => {
    if (!containerRef.current) return;

    const handleResize = () => {
      // Update molstarDiv dimensions explicitly to match new container size
      if (molstarContainerRef.current && containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const pixelWidth = Math.floor(containerRect.width);
        const pixelHeight = Math.floor(containerRect.height);

        // Only update if dimensions are valid (non-zero)
        if (pixelWidth > 0 && pixelHeight > 0) {
          molstarContainerRef.current.style.width = `${pixelWidth}px`;
          molstarContainerRef.current.style.height = `${pixelHeight}px`;
        }
      }

      // Handle Mol* resize
      if (pluginRef.current?.canvas3d) {
        pluginRef.current.canvas3d.handleResize();
      }

      // Only re-render fallback if we're in fallback mode
      if (useFallback) {
        renderFallback();
      }
    };

    // Use ResizeObserver for container resize events
    // This ensures the viewer resizes correctly when the layout changes (e.g. sidebar toggles)
    const resizeObserver = new ResizeObserver(() => {
      // Use requestAnimationFrame to avoid "ResizeObserver loop limit exceeded" error
      requestAnimationFrame(() => {
        handleResize();
      });
    });

    resizeObserver.observe(containerRef.current);

    // Also listen to window resize as a backup
    window.addEventListener('resize', handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [renderFallback, useFallback]);

  // Subscribe to Mol* layout events to recenter view when panels open/close
  useEffect(() => {
    if (!pluginReady) return;

    const plugin = pluginRef.current;
    if (!plugin?.layout) return;

    // Debounce timer for layout updates
    let layoutUpdateTimer: NodeJS.Timeout | null = null;

    // Helper function to update molstar container dimensions
    const updateMolstarDimensions = () => {
      if (molstarContainerRef.current && containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const pixelWidth = Math.floor(containerRect.width);
        const pixelHeight = Math.floor(containerRect.height);

        if (pixelWidth > 0 && pixelHeight > 0) {
          molstarContainerRef.current.style.width = `${pixelWidth}px`;
          molstarContainerRef.current.style.height = `${pixelHeight}px`;
        }
      }
    };

    // When Mol* panels (Structure Tools, State Tree, etc.) open/close,
    // recenter the camera to keep the structure visible and centered
    const subscription = plugin.layout.events.updated.subscribe(() => {
      if (!plugin.canvas3d) return;

      // Cancel any pending reset
      if (layoutUpdateTimer) {
        clearTimeout(layoutUpdateTimer);
      }

      // Update container dimensions immediately
      updateMolstarDimensions();

      // Immediate resize to update viewport dimensions
      plugin.canvas3d.handleResize();

      // Debounced camera reset sequence - wait for layout animation to complete
      layoutUpdateTimer = setTimeout(async () => {
        if (!plugin.canvas3d) return;

        // Helper function to reset camera with zoom and tilt
        const resetCameraView = async () => {
          if (!plugin.canvas3d) return;

          // Update dimensions again in case they changed during animation
          updateMolstarDimensions();
          plugin.canvas3d.handleResize();

          try {
            const modules = await loadMolstarModules();
            await modules.PluginCommands.Camera.Reset(plugin, {});

            // Apply zoom and tilt after reset
            await new Promise(resolve => requestAnimationFrame(resolve));

            const camera = plugin.canvas3d.camera;
            if (camera) {
              const snapshot = camera.getSnapshot();
              const tiltAngle = Math.PI / 9; // ~20 degrees
              const rotationAngle = Math.PI / 12; // ~15 degrees horizontal rotation
              const zoomFactor = 0.7;

              await modules.PluginCommands.Camera.SetSnapshot(plugin, {
                snapshot: {
                  ...snapshot,
                  radius: snapshot.radius * zoomFactor,
                  up: [
                    Math.sin(rotationAngle) * Math.sin(tiltAngle),
                    Math.cos(tiltAngle),
                    Math.cos(rotationAngle) * Math.sin(tiltAngle)
                  ] as [number, number, number]
                },
                durationMs: 0
              });
            }
          } catch (e) {
            plugin.canvas3d.requestCameraReset();
          }
        };

        // Series of resets to ensure proper centering after panel animation
        const resetSequence = [50, 150, 350, 600];
        resetSequence.forEach((delay) => {
          setTimeout(resetCameraView, delay);
        });
      }, 50);
    });

    return () => {
      if (layoutUpdateTimer) {
        clearTimeout(layoutUpdateTimer);
      }
      subscription.unsubscribe();
    };
  }, [pluginReady]);

  // Handle retry - reinitialize the viewer
  const handleRetry = useCallback(() => {
    setError(null);
    setIsLoading(true);
    // Reset module promise to force fresh initialization
    initPromiseRef.current = null;
    // Re-trigger initialization
    const timer = setTimeout(() => {
      initViewer().then(() => loadStructure());
    }, 100);
    return () => clearTimeout(timer);
  }, [initViewer, loadStructure]);

  if (error && !pdbData) {
    return (
      <div
        className="molstar-viewer-container flex items-center justify-center h-full"
        role="alert"
        aria-live="polite"
      >
        <div className="text-center text-cf-text-secondary">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-cf-error" aria-hidden="true" />
          <p className="mb-2">Failed to load structure</p>
          <p className="text-xs text-cf-text-muted mb-3">{error}</p>
          <button
            onClick={handleRetry}
            className="px-3 py-1.5 bg-cf-bg-tertiary hover:bg-cf-highlight text-cf-text text-sm rounded transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`molstar-viewer-container h-full w-full relative ${minimalUI ? 'molstar-minimal-ui' : ''}`}
      role="img"
      aria-label="3D protein structure viewer"
      style={{
        // CSS performance optimizations
        willChange: 'transform', // GPU acceleration hint
        contain: 'layout style paint', // CSS containment for better performance
      }}
    >
      {/* Molstar container - MUST have NO React children to avoid DOM conflicts */}
      {/* Note: removed isolation: isolate to allow Mol* expanded viewport to cover other elements */}
      <div
        ref={containerRef}
        className="absolute inset-0"
      />

      {/* Loading overlay - sibling of containerRef, not child */}
      {isLoading && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-cf-bg z-10 pointer-events-none"
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 border-cf-accent animate-spin" aria-hidden="true" />
            <span className="text-sm text-cf-text-secondary">Loading structure...</span>
          </div>
        </div>
      )}

      {/* Error indicator with retry button - sibling of containerRef, not child */}
      {error && (
        <div className="absolute top-4 right-4 flex items-center gap-2 bg-cf-warning/20 text-cf-warning px-2 py-1 rounded text-xs">
          <span>Using fallback renderer</span>
          <button
            onClick={handleRetry}
            className="underline hover:text-cf-warning/80 transition-colors"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}));
