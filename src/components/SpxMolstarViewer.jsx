'use client';

import { useEffect, useRef, useState, memo, useCallback } from 'react';
import { Loader2, Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';

// Molstar modules loaded dynamically
let molstarLoaded = false;
let createPluginUI = null;
let renderReact18 = null;
let DefaultPluginUISpec = null;
let PluginCommands = null;
let Asset = null;
let StructureElement = null;

async function loadMolstar() {
  if (typeof window === 'undefined') return false;
  if (molstarLoaded) return true;

  try {
    // Dynamic imports
    const [pluginUI, react18, spec, commands, assets, structureElement] = await Promise.all([
      import('molstar/lib/mol-plugin-ui'),
      import('molstar/lib/mol-plugin-ui/react18'),
      import('molstar/lib/mol-plugin-ui/spec'),
      import('molstar/lib/mol-plugin/commands'),
      import('molstar/lib/mol-util/assets'),
      import('molstar/lib/mol-model/structure')
    ]);

    createPluginUI = pluginUI.createPluginUI;
    renderReact18 = react18.renderReact18;
    DefaultPluginUISpec = spec.DefaultPluginUISpec;
    PluginCommands = commands.PluginCommands;
    Asset = assets.Asset;
    StructureElement = structureElement.StructureElement;

    // Load CSS from CDN to avoid SCSS compilation issues
    if (!document.getElementById('molstar-dark-theme')) {
      const link = document.createElement('link');
      link.id = 'molstar-dark-theme';
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/molstar@latest/build/viewer/molstar.css';
      document.head.appendChild(link);
    }

    molstarLoaded = true;
    return true;
  } catch (error) {
    console.error('Failed to load Molstar:', error);
    return false;
  }
}

// Helper function to extract atom information from a location
function extractAtomInfo(location, position) {
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

// Three-letter to one-letter amino acid conversion table
const threeToOne = {
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

// Helper function to extract selection information (for sequence selection)
function extractSelectionInfo(plugin) {
  if (!StructureElement) return null;

  const selectionManager = plugin.managers.structure.selection;
  const entries = selectionManager.entries;

  const selections = [];

  entries.forEach((entry, ref) => {
    const loci = entry.selection;
    if (!StructureElement.Loci.is(loci) || StructureElement.Loci.isEmpty(loci)) {
      return;
    }

    // Collect all selected residue information
    const residues = new Map();  // residueKey -> residueInfo

    StructureElement.Loci.forEachLocation(loci, (location) => {
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

// Memoized component to prevent unnecessary re-renders
const SpxMolstarViewer = memo(function SpxMolstarViewer({
  pdbUrl,
  pdbData,
  format = 'pdb',
  className = '',
  showControls = true,
  minimalUI = false,  // New prop for minimal UI mode (hides all panels)
  isExpanded = false,
  onToggleExpand,
  onAtomClick,
  onSelectionChange
}) {
  const containerRef = useRef(null);
  const pluginRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize Molstar
  useEffect(() => {
    let mounted = true;

    async function init() {
      if (!containerRef.current) return;

      setIsLoading(true);
      setError(null);

      try {
        // Load Molstar modules
        const loaded = await loadMolstar();
        if (!loaded || !mounted) {
          if (mounted) setError('Failed to load molecular viewer');
          return;
        }

        // Create plugin instance with minimal or full UI based on prop
        const spec = minimalUI ? {
          ...DefaultPluginUISpec(),
          layout: {
            initial: {
              isExpanded: false,
              showControls: false,  // Hide all built-in controls in minimal mode
              controlsDisplay: 'reactive',
              regionState: {
                left: 'hidden',
                right: 'hidden',
                top: 'hidden',
                bottom: 'hidden',
              }
            }
          },
          canvas3d: {
            renderer: {
              backgroundColor: 0x000000 // Pure black for minimal mode
            }
          },
          components: {
            remoteState: 'none'
          }
        } : {
          ...DefaultPluginUISpec(),
          layout: {
            initial: {
              isExpanded: false,
              showControls: showControls,
              controlsDisplay: 'reactive',
              regionState: {
                left: 'collapsed',
                right: 'collapsed',
                top: 'full',      // Shows sequence panel at top
                bottom: 'hidden', // Hide bottom panel for cleaner look
              }
            }
          },
          canvas3d: {
            renderer: {
              backgroundColor: 0x1a1a1a // Dark background to match SPX theme
            }
          },
          components: {
            remoteState: 'none'
          },
          config: [
            // Enable sequence view
            [DefaultPluginUISpec().config?.[0]?.[0] || 'structure-focus-representation', { name: 'structure-focus-representation', params: {} }],
          ]
        };

        const plugin = await createPluginUI({
          target: containerRef.current,
          render: renderReact18,
          spec
        });

        if (!mounted) {
          plugin.dispose();
          return;
        }

        pluginRef.current = plugin;
        setIsInitialized(true);

        // Load structure if URL or data provided
        if (pdbUrl || pdbData) {
          await loadStructure(plugin, pdbUrl, pdbData, format);
        }

        setIsLoading(false);
      } catch (err) {
        console.error('Molstar initialization error:', err);
        if (mounted) {
          setError(err.message || 'Failed to initialize viewer');
          setIsLoading(false);
        }
      }
    }

    init();

    return () => {
      mounted = false;
      if (pluginRef.current) {
        pluginRef.current.dispose();
        pluginRef.current = null;
      }
    };
  }, []);

  // Load structure when URL/data changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isInitialized || !pluginRef.current) return;

    async function load() {
      setIsLoading(true);
      try {
        await loadStructure(pluginRef.current, pdbUrl, pdbData, format);
      } catch (err) {
        setError(err.message || 'Failed to load structure');
      }
      setIsLoading(false);
    }

    load();
  }, [pdbUrl, pdbData, format, isInitialized]);

  // Set up click event handling
  useEffect(() => {
    if (!isInitialized || !pluginRef.current || !onAtomClick) return;

    const plugin = pluginRef.current;

    // Subscribe to click events
    const subscription = plugin.behaviors.interaction.click.subscribe(
      ({ current, position }) => {
        try {
          // Check if we clicked on a structure element
          if (StructureElement && StructureElement.Loci.is(current.loci)) {
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
  }, [isInitialized, onAtomClick]);

  // Set up selection change handling (for sequence selection)
  useEffect(() => {
    if (!isInitialized || !pluginRef.current || !onSelectionChange) return;

    const plugin = pluginRef.current;

    // Subscribe to selection change events
    const subscription = plugin.managers.structure.selection.events.changed.subscribe(() => {
      try {
        const selectionInfo = extractSelectionInfo(plugin);
        onSelectionChange(selectionInfo);
      } catch (err) {
        console.error('Error handling selection change:', err);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [isInitialized, onSelectionChange]);

  // Load structure helper
  async function loadStructure(plugin, url, data, fmt) {
    await plugin.clear();

    let dataObj;
    if (url) {
      dataObj = await plugin.builders.data.download(
        { url: Asset.Url(url), isBinary: false },
        { state: { isGhost: true } }
      );
    } else if (data) {
      dataObj = await plugin.builders.data.rawData(
        { data, label: 'Structure' },
        { state: { isGhost: true } }
      );
    } else {
      return;
    }

    const trajectory = await plugin.builders.structure.parseTrajectory(dataObj, fmt);
    await plugin.builders.structure.hierarchy.applyPreset(trajectory, 'default', {
      structure: { name: 'model', params: {} },
      showUnitcell: false,
      representationPreset: 'auto'
    });
  }

  // Memoized control handlers
  const handleReset = useCallback(() => {
    if (pluginRef.current) {
      PluginCommands.Camera.Reset(pluginRef.current, {});
    }
  }, []);

  const handleZoomIn = useCallback(() => {
    if (pluginRef.current?.canvas3d) {
      const camera = pluginRef.current.canvas3d.camera;
      // Zoom in by reducing distance
      PluginCommands.Camera.SetSnapshot(pluginRef.current, {
        snapshot: {
          ...camera.getSnapshot(),
          radius: camera.getSnapshot().radius * 0.8
        }
      });
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (pluginRef.current?.canvas3d) {
      const camera = pluginRef.current.canvas3d.camera;
      // Zoom out by increasing distance
      PluginCommands.Camera.SetSnapshot(pluginRef.current, {
        snapshot: {
          ...camera.getSnapshot(),
          radius: camera.getSnapshot().radius * 1.2
        }
      });
    }
  }, []);

  return (
    <div className={`relative bg-zinc-900 rounded-xl overflow-hidden ${className}`}>
      {/* Toolbar */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        <button
          onClick={handleZoomIn}
          className="p-1.5 bg-zinc-800/80 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white transition-colors"
          title="放大"
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-1.5 bg-zinc-800/80 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white transition-colors"
          title="缩小"
        >
          <ZoomOut size={16} />
        </button>
        <button
          onClick={handleReset}
          className="p-1.5 bg-zinc-800/80 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white transition-colors"
          title="重置视角"
        >
          <RotateCcw size={16} />
        </button>
        {onToggleExpand && (
          <button
            onClick={onToggleExpand}
            className="p-1.5 bg-zinc-800/80 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white transition-colors"
            title={isExpanded ? "退出全屏" : "全屏"}
          >
            {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        )}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80 z-20">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <span className="text-sm text-zinc-400">加载分子结构...</span>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 z-20">
          <div className="text-center">
            <p className="text-red-400 mb-2">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-sm rounded transition-colors"
            >
              重新加载
            </button>
          </div>
        </div>
      )}

      {/* Molstar Container */}
      <div
        ref={containerRef}
        className="w-full h-full min-h-[400px]"
        style={{
          position: 'relative',
          willChange: 'transform', // GPU acceleration hint
          contain: 'layout style paint', // CSS containment for performance
        }}
      />
    </div>
  );
});

export default SpxMolstarViewer;
