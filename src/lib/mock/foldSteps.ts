import { FoldStep, StageType } from '@/lib/types';
import { generateFoldingStep } from './pdbData';

export function generateMockFoldSteps(count: number = 5): FoldStep[] {
  const steps: FoldStep[] = [];
  const stages: StageType[] = ['QUEUED', 'MSA', 'MODEL', 'RELAX', 'QA'];

  for (let i = 0; i < count; i++) {
    const isLast = i === count - 1;
    const isFirst = i === 0;

    steps.push({
      id: `step-${i}`,
      stepNumber: i + 1,
      status: isLast ? 'active' : isFirst ? 'pending' : 'completed',
      structureId: `structure-${i}`,
      label: i === 0 ? 'Initial' : i === count - 1 ? 'Final' : `Intermediate ${i}`,
      stage: stages[Math.min(i, stages.length - 1)],
      metrics: {
        rmsd: 2.5 - (i * 0.4) + Math.random() * 0.3,
        energy: -50 - (i * 10) + Math.random() * 5,
        time: i * 2.5 + Math.random() * 0.5,
        hBonds: 40 + i * 8 + Math.floor(Math.random() * 5),
        hydrophobic: 35 + i * 6 + Math.floor(Math.random() * 4),
      },
      pdbData: generateFoldingStep(i + 1, count),
    });
  }

  return steps;
}

export function generateStreamingFoldSteps(
  callback: (step: FoldStep) => void,
  interval: number = 2000,
  totalSteps: number = 6
): () => void {
  let currentStep = 0;
  const steps = generateMockFoldSteps(totalSteps);

  const timer = setInterval(() => {
    if (currentStep < steps.length) {
      callback(steps[currentStep]);
      currentStep++;
    } else {
      clearInterval(timer);
    }
  }, interval);

  // Return cleanup function
  return () => clearInterval(timer);
}
