'use client';

import { useEffect, useRef, useCallback, useState, useLayoutEffect, memo } from 'react';
import { useAppStore } from '@/lib/store';
import { AtomInfo } from '@/lib/types';
import { Loader2, AlertCircle, Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';

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
}

// Type definitions for Mol* (using any for compatibility)
type MolstarPlugin = any;
type StructureElementModule = any;
type PluginCommandsModule = any;

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

export const MolstarViewer = memo(function MolstarViewer({
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
  onAtomCountChange
}: MolstarViewerProps) {
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
        // Dynamic import of molstar to avoid SSR issues
        const { createPluginUI } = await import('molstar/lib/mol-plugin-ui');
        const { renderReact18 } = await import('molstar/lib/mol-plugin-ui/react18');
        const { DefaultPluginUISpec } = await import('molstar/lib/mol-plugin-ui/spec');
        const { Color } = await import('molstar/lib/mol-util/color');
        const { StructureElement } = await import('molstar/lib/mol-model/structure');
        const { PluginCommands } = await import('molstar/lib/mol-plugin/commands');
        const { PluginConfig } = await import('molstar/lib/mol-plugin/config');

        // Store modules for later use
        structureElementRef.current = StructureElement;
        pluginCommandsRef.current = PluginCommands;

        // Cleanup any existing plugin
        disposePlugin();

        if (!isMountedRef.current || !containerRef.current) return;

        // Clear any existing content (including fallback canvas)
        containerRef.current.innerHTML = '';

        // Create a separate div for molstar (not managed by React)
        const molstarDiv = document.createElement('div');
        molstarDiv.style.width = '100%';
        molstarDiv.style.height = '100%';
        molstarDiv.style.position = 'absolute';
        molstarDiv.style.top = '0';
        molstarDiv.style.left = '0';
        containerRef.current.appendChild(molstarDiv);
        molstarContainerRef.current = molstarDiv;

        // Create plugin with minimal or full UI based on prop
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
            // Hide built-in viewport controls (zoom in/out, reset camera)
            // We use our own custom controls instead
            [PluginConfig.Viewport.ShowControls, false] as [typeof PluginConfig.Viewport.ShowControls, boolean],
          ]
        } : {
          ...DefaultPluginUISpec(),
          layout: {
            initial: {
              isExpanded: false,
              showControls: true,
              controlsDisplay: 'reactive' as const,
              regionState: {
                left: 'hidden' as const,
                right: 'hidden' as const,
                top: 'full' as const,
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
          }
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

      // Set white background color for WebGL rendering
      if (plugin.canvas3d) {
        // Import Color dynamically
        const { Color } = await import('molstar/lib/mol-util/color');
        plugin.canvas3d.setProps({
          renderer: {
            ...plugin.canvas3d.props.renderer,
            backgroundColor: Color(0xffffff),
          },
          transparentBackground: false,
        });
      }

      // Import Asset for URL loading
      const { Asset } = await import('molstar/lib/mol-util/assets');

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

      // Apply custom camera angle and zoom
      // Position camera at a nice viewing angle (slightly from above and side)
      const applyCameraView = () => {
        const plugin = pluginRef.current;
        if (!plugin?.canvas3d) return;

        // Force resize first
        plugin.canvas3d.handleResize();

        const camera = plugin.canvas3d.camera;
        if (!camera) return;

        // Get structure center from bounding sphere
        const boundingSphere = plugin.canvas3d.boundingSphere;
        if (!boundingSphere || boundingSphere.radius < 1) return;

        const target = [boundingSphere.center[0], boundingSphere.center[1], boundingSphere.center[2]];
        const radius = boundingSphere.radius;

        // We want the camera at a comfortable distance - about 1.5x the structure radius
        const desiredDistance = Math.max(radius * 1.5, 20);

        // Position camera at a nice viewing angle:
        // - 30 degrees rotated around Y axis (horizontal rotation for 3D depth)
        // - 20 degrees from above (vertical tilt for better perspective)
        const horizontalAngle = Math.PI / 6;  // 30 degrees
        const verticalAngle = Math.PI / 9;    // 20 degrees

        // Calculate camera position using spherical coordinates
        const newPosition = [
          target[0] + desiredDistance * Math.cos(verticalAngle) * Math.sin(horizontalAngle),
          target[1] + desiredDistance * Math.sin(verticalAngle),
          target[2] + desiredDistance * Math.cos(verticalAngle) * Math.cos(horizontalAngle)
        ];

        console.log('[MolstarViewer] Setting camera at distance', desiredDistance.toFixed(1),
          'angle (h:', (horizontalAngle * 180 / Math.PI).toFixed(0), '°, v:', (verticalAngle * 180 / Math.PI).toFixed(0), '°)');

        const snapshot = camera.getSnapshot();
        camera.setState({
          ...snapshot,
          target: target,
          position: newPosition,
          up: [0, 1, 0],
          radius: radius,
          radiusMax: radius * 10
        });
        plugin.canvas3d.commit(true);
      };

      // Apply view immediately and on layout transitions
      // Use requestAnimationFrame to ensure rendering is ready
      requestAnimationFrame(() => {
        applyCameraView();
        // Re-apply on layout transitions (200ms duration in Canvas.tsx)
        setTimeout(applyCameraView, 100);
        setTimeout(applyCameraView, 300);
      });

      // Count atoms and notify parent
      if (pdbData) {
        onAtomCountChange?.(parseAtomCount(pdbData));
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
  }, [pdbData, structureId, parseAtomCount]);

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
  const handleResetView = useCallback(() => {
    const plugin = pluginRef.current;
    if (!plugin?.canvas3d) return;

    const camera = plugin.canvas3d.camera;
    const boundingSphere = plugin.canvas3d.boundingSphere;
    if (!camera || !boundingSphere || boundingSphere.radius < 1) return;

    const target = [boundingSphere.center[0], boundingSphere.center[1], boundingSphere.center[2]];
    const radius = boundingSphere.radius;
    const desiredDistance = Math.max(radius * 1.5, 20);

    const horizontalAngle = Math.PI / 6;
    const verticalAngle = Math.PI / 9;

    const newPosition = [
      target[0] + desiredDistance * Math.cos(verticalAngle) * Math.sin(horizontalAngle),
      target[1] + desiredDistance * Math.sin(verticalAngle),
      target[2] + desiredDistance * Math.cos(verticalAngle) * Math.cos(horizontalAngle)
    ];

    const snapshot = camera.getSnapshot();
    camera.setState({
      ...snapshot,
      target: target,
      position: newPosition,
      up: [0, 1, 0],
      radius: radius,
      radiusMax: radius * 10
    }, 250); // Animate over 250ms
  }, []);

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
    const handleReset = () => {
      if (useFallback) {
        renderFallback();
        return;
      }

      const plugin = pluginRef.current;
      if (!plugin?.canvas3d) return;

      const camera = plugin.canvas3d.camera;
      const boundingSphere = plugin.canvas3d.boundingSphere;
      if (!camera || !boundingSphere || boundingSphere.radius < 1) return;

      const target = [boundingSphere.center[0], boundingSphere.center[1], boundingSphere.center[2]];
      const radius = boundingSphere.radius;
      const desiredDistance = Math.max(radius * 1.5, 20);

      const horizontalAngle = Math.PI / 6;
      const verticalAngle = Math.PI / 9;

      const newPosition = [
        target[0] + desiredDistance * Math.cos(verticalAngle) * Math.sin(horizontalAngle),
        target[1] + desiredDistance * Math.sin(verticalAngle),
        target[2] + desiredDistance * Math.cos(verticalAngle) * Math.cos(horizontalAngle)
      ];

      const snapshot = camera.getSnapshot();
      camera.setState({
        ...snapshot,
        target: target,
        position: newPosition,
        up: [0, 1, 0],
        radius: radius,
        radiusMax: radius * 10
      });
      plugin.canvas3d.commit(true);
    };

    window.addEventListener('molstar-reset-view', handleReset);
    return () => window.removeEventListener('molstar-reset-view', handleReset);
  }, [renderFallback, useFallback]);

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

    // Try Molstar first, fallback to canvas if it fails
    initViewer()
      .then(() => {
        if (isMountedRef.current) {
          return loadStructure();
        }
      })
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

  if (error && !pdbData) {
    return (
      <div
        className="molstar-viewer-container flex items-center justify-center h-full"
        role="alert"
        aria-live="polite"
      >
        <div className="text-center text-cf-text-secondary">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-500" aria-hidden="true" />
          <p className="mb-2">Failed to load structure</p>
          <p className="text-xs text-cf-text-muted">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="molstar-viewer-container h-full w-full relative"
      role="img"
      aria-label="3D protein structure viewer"
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

      {/* Error indicator - sibling of containerRef, not child */}
      {error && (
        <div className="absolute top-4 right-4 bg-yellow-500/20 text-yellow-500 px-2 py-1 rounded text-xs pointer-events-none">
          Using fallback renderer
        </div>
      )}
    </div>
  );
});
