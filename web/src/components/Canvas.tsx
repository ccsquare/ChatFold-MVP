'use client';

import { useState, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { CanvasTabs } from './CanvasTabs';
import { MolstarViewer } from './MolstarViewer';
import { CompareViewer } from './CompareViewer';
import { SequenceViewer } from './SequenceViewer';
import { AtomInfo } from '@/lib/types';
import { ViewerToolbar } from './ViewerToolbar';
import { FlaskConical } from 'lucide-react';

export function Canvas() {
  const viewerTabs = useAppStore(state => state.viewerTabs);
  const activeTabId = useAppStore(state => state.activeTabId);
  const setTabSelection = useAppStore(state => state.setTabSelection);
  const setTabAtomCount = useAppStore(state => state.setTabAtomCount);
  const isMolstarExpanded = useAppStore(state => state.isMolstarExpanded);

  const activeTab = viewerTabs.find(t => t.id === activeTabId);
  const [isExpanded, setIsExpanded] = useState(false);

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

  // Determine if current tab is a sequence file
  const isSequenceFile = activeTab?.filename && /\.(fasta|fa|txt)$/i.test(activeTab.filename);

  return (
    <main className="flex-1 flex flex-col overflow-hidden" aria-label="Protein structure viewer">
      {/* Tabs - hide when Mol* built-in expand is active or in CSS fullscreen mode */}
      {!isMolstarExpanded && !isExpanded && <CanvasTabs />}

      {/* Main Canvas Area */}
      <div className="flex-1 flex overflow-hidden">
        {activeTab ? (
          <section
            className={cn(
              "flex flex-col overflow-hidden relative transition-all duration-200",
              isExpanded
                ? "fixed inset-0 z-[9999] bg-cf-bg"
                : "flex-1"
            )}
            aria-label={isExpanded ? "3D structure viewer (expanded)" : "3D structure viewer"}
          >
            {/* Toolbar - hide when Mol* built-in expand is active or in compare mode (CompareViewer has its own toolbar) */}
            {!isMolstarExpanded && !activeTab.isCompare && (
              <ViewerToolbar
                isExpanded={isExpanded}
                onToggleExpand={handleToggleExpand}
              />
            )}

            {/* Viewer Content - single instance, never remounts on fullscreen toggle */}
            <div className="flex-1 relative overflow-hidden">
              {activeTab.isCompare ? (
                <CompareViewer
                  key={activeTab.id}
                  tab={activeTab}
                  isExpanded={isExpanded}
                  onToggleExpand={handleToggleExpand}
                />
              ) : isSequenceFile ? (
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
        ) : (
          /* Empty State */
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
        )}
      </div>
    </main>
  );
}
