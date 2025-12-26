// Stage icons and labels for protein folding pipeline steps

import {
  Timer,
  AlignJustify,
  Brain,
  Waves,
  ShieldCheck,
  CircleAlert,
  CheckCircle2,
} from 'lucide-react';
import type { StageType } from '@/lib/types';

export const STAGE_ICONS: Record<StageType, React.ComponentType<{ className?: string }>> = {
  'QUEUED': Timer,
  'MSA': AlignJustify,
  'MODEL': Brain,
  'RELAX': Waves,
  'QA': ShieldCheck,
  'DONE': CheckCircle2,
  'ERROR': CircleAlert,
};

export const STAGE_LABELS: Record<StageType, string> = {
  'QUEUED': 'Queued',
  'MSA': 'Sequence Alignment',
  'MODEL': 'Structure Prediction',
  'RELAX': 'Energy Relaxation',
  'QA': 'Quality Assessment',
  'DONE': 'Complete',
  'ERROR': 'Error',
};
