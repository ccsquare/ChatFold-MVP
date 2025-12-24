'use client';

import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { X } from 'lucide-react';
import { HelixIcon } from '@/components/icons/ProteinIcon';

export function CanvasTabs() {
  const viewerTabs = useAppStore(state => state.viewerTabs);
  const activeTabId = useAppStore(state => state.activeTabId);
  const setActiveTab = useAppStore(state => state.setActiveTab);
  const closeTab = useAppStore(state => state.closeTab);

  if (viewerTabs.length === 0) {
    return null;
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center h-10 border-b border-cf-border bg-cf-bg overflow-x-auto">
        {viewerTabs.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              "flex items-center gap-1 px-3 h-full border-r border-cf-border cursor-pointer group",
              tab.id === activeTabId ? "bg-cf-bg-tertiary" : "hover:bg-cf-highlight"
            )}
            onClick={() => setActiveTab(tab.id)}
          >
            <HelixIcon className="w-4 h-4 text-cf-success/60 flex-shrink-0" />
            <span className={cn(
              "text-[13px] truncate max-w-[120px]",
              tab.id === activeTabId ? "text-cf-text" : "text-cf-text-muted"
            )}>
              {tab.filename}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 p-0.5 opacity-0 group-hover:opacity-60 hover:opacity-100 hover:bg-cf-highlight transition-all"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                >
                  <X className="w-3 h-3 text-cf-text-secondary hover:text-cf-text" />
                  <span className="sr-only">Close tab</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Close tab</TooltipContent>
            </Tooltip>
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}
