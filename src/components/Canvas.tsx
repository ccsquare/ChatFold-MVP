'use client';

import { useState, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { CanvasTabs } from './CanvasTabs';
import { MolstarViewer } from './MolstarViewer';
import { SequenceViewer } from './SequenceViewer';
import { StructurePreview } from './StructurePreview';
import { AtomInfo } from '@/lib/types';
import { ViewerToolbar } from './ViewerToolbar';
import { InspectorPanel } from './InspectorPanel';
import { FlaskConical } from 'lucide-react';

export function Canvas() {
  const viewerTabs = useAppStore(state => state.viewerTabs);
  const activeTabId = useAppStore(state => state.activeTabId);
  const setTabSelection = useAppStore(state => state.setTabSelection);
  const setTabAtomCount = useAppStore(state => state.setTabAtomCount);
  const activeTask = useAppStore(state => state.activeTask);
  const isStreaming = useAppStore(state => state.isStreaming);

  const activeTab = viewerTabs.find(t => t.id === activeTabId);
  const [isExpanded, setIsExpanded] = useState(false);

  // Get structures from active task for preview
  const previewStructures = activeTask?.structures || [];

  const handleAtomClick = useCallback((atomInfo: AtomInfo) => {
    if (activeTabId) {
      setTabSelection(activeTabId, atomInfo);
    }
  }, [activeTabId, setTabSelection]);

  const handleAtomCountChange = useCallback((count: number) => {
    if (activeTabId) {
      setTabAtomCount(activeTabId, count);
    }
  }, [activeTabId, setTabAtomCount]);

  const handleToggleExpand = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  return (
    <main className="flex-1 flex flex-col overflow-hidden" aria-label="Protein structure viewer">
      {/* Tabs */}
      <CanvasTabs />

      {/* Main Canvas Area */}
      <div className="flex-1 flex overflow-hidden">
        {activeTab ? (
          <>
            {/* Viewer Area */}
            <section 
              className={cn(
                "flex-1 flex flex-col overflow-hidden relative transition-all duration-200",
                isExpanded ? "fixed inset-0 z-[100] bg-white" : ""
              )} 
              aria-label="3D structure viewer"
            >
              {/* Toolbar */}
              <ViewerToolbar 
                isExpanded={isExpanded}
                onToggleExpand={handleToggleExpand}
              />

              {/* Viewer Content */}
              <div className="flex-1 relative">
                {activeTab.filename && /\.(fasta|fa|txt)$/i.test(activeTab.filename) ? (
                  <SequenceViewer 
                    content={activeTab.pdbData} 
                    label={activeTab.label} 
                  />
                ) : (
                  <MolstarViewer
                    key={activeTab.id}
                    tabId={activeTab.id}
                    pdbData={activeTab.pdbData}
                    structureId={activeTab.structureId}
                    isExpanded={isExpanded}
                    onToggleExpand={handleToggleExpand}
                    onAtomClick={handleAtomClick}
                    onAtomCountChange={handleAtomCountChange}
                  />
                )}
              </div>
            </section>

            {/* Inspector Panel */}
            <InspectorPanel tab={activeTab} />
          </>
        ) : (
          /* Empty State or Structure Preview */
          (previewStructures.length > 0 || isStreaming) ? (
            /* Show preview when there are structures or streaming */
            <StructurePreview
              structures={previewStructures}
              isStreaming={isStreaming}
            />
          ) : (
            /* Default empty state */
            <div className="flex-1 flex items-center justify-center" role="status" aria-label="No structure loaded">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-cf-bg-tertiary flex items-center justify-center">
                  <FlaskConical className="w-8 h-8 text-cf-text-muted" aria-hidden="true" />
                </div>
                <p className="text-cf-text-secondary mb-1">No structure loaded</p>
                <p className="text-sm text-cf-text-muted">
                  Upload a FASTA file or select a structure from steps
                </p>
              </div>
            </div>
          )
        )}
      </div>
    </main>
  );
}
