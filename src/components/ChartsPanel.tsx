'use client';

import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { BarChart3, TrendingUp, Activity } from 'lucide-react';

export function ChartsPanel() {
  const { activeTask } = useAppStore();

  // Extract metrics from structures
  const structureMetrics = activeTask?.structures.map(s => ({
    label: s.label,
    filename: s.filename,
    plddt: s.metrics.plddtAvg,
    pae: s.metrics.paeAvg
  })) || [];

  // Progress history from steps
  const progressHistory = activeTask?.steps.map(step => ({
    stage: step.stage,
    progress: step.progress,
    timestamp: step.ts
  })) || [];

  if (!activeTask) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center text-cf-text-secondary">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No data to display</p>
          <p className="text-xs text-cf-text-muted mt-1">
            Start a folding task to see charts
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Progress History */}
      <div className="bg-cf-bg rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-cf-text-secondary" />
          <h3 className="text-sm font-medium text-cf-text">Progress History</h3>
        </div>

        {progressHistory.length > 0 ? (
          <div className="space-y-2">
            {/* Simple progress bars for each stage */}
            {progressHistory.map((item, index) => (
              <div key={index} className="flex items-center gap-3">
                <span className="text-xs text-cf-text-muted w-16 truncate">
                  {item.stage}
                </span>
                <div className="flex-1 h-2 bg-cf-bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cf-success rounded-full transition-all"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
                <span className="text-xs text-cf-text-secondary w-10 text-right">
                  {item.progress}%
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-cf-text-muted text-center py-4">
            Waiting for progress data...
          </p>
        )}
      </div>

      {/* Structure Metrics */}
      <div className="bg-cf-bg rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-cf-text-secondary" />
          <h3 className="text-sm font-medium text-cf-text">Structure Metrics</h3>
        </div>

        {structureMetrics.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-cf-border">
                  <th className="text-left py-2 text-cf-text-muted font-medium">Structure</th>
                  <th className="text-right py-2 text-cf-text-muted font-medium">pLDDT</th>
                  <th className="text-right py-2 text-cf-text-muted font-medium">PAE</th>
                </tr>
              </thead>
              <tbody>
                {structureMetrics.map((metric, index) => (
                  <tr key={index} className="border-b border-cf-border/50">
                    <td className="py-2 text-cf-text">
                      <span className="truncate max-w-[120px] inline-block">
                        {metric.label}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <span className={cn(
                        "font-medium",
                        metric.plddt >= 70 ? "text-cf-success" : "text-yellow-500"
                      )}>
                        {metric.plddt.toFixed(1)}
                      </span>
                    </td>
                    <td className="py-2 text-right text-cf-text">
                      {metric.pae.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Simple bar chart for pLDDT */}
            <div className="mt-4">
              <p className="text-xs text-cf-text-muted mb-2">pLDDT Comparison</p>
              <div className="flex items-end gap-2 h-20">
                {structureMetrics.map((metric, index) => (
                  <div key={index} className="flex-1 flex flex-col items-center">
                    <div
                      className={cn(
                        "w-full rounded-t transition-all",
                        metric.plddt >= 70 ? "bg-cf-success" : "bg-yellow-500"
                      )}
                      style={{ height: `${metric.plddt}%` }}
                    />
                    <span className="text-[10px] text-cf-text-muted mt-1 truncate max-w-full">
                      {metric.label.slice(0, 8)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-cf-text-muted text-center py-4">
            No structures generated yet
          </p>
        )}
      </div>

      {/* Task Info */}
      <div className="bg-cf-bg rounded-lg p-4">
        <h3 className="text-sm font-medium text-cf-text mb-3">Task Info</h3>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-cf-text-muted">Task ID:</span>
            <span className="text-cf-text font-mono">{activeTask.id.slice(0, 12)}...</span>
          </div>
          <div className="flex justify-between">
            <span className="text-cf-text-muted">Status:</span>
            <span className={cn(
              "capitalize",
              activeTask.status === 'complete' ? "text-cf-success" :
                activeTask.status === 'running' ? "text-blue-400" :
                  "text-cf-text"
            )}>
              {activeTask.status}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-cf-text-muted">Sequence Length:</span>
            <span className="text-cf-text">{activeTask.sequence.length} aa</span>
          </div>
          <div className="flex justify-between">
            <span className="text-cf-text-muted">Steps:</span>
            <span className="text-cf-text">{activeTask.steps?.length || 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-cf-text-muted">Structures:</span>
            <span className="text-cf-text">{activeTask.structures?.length || 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
