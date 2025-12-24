# Chat Components - Quick Reference

## Import Components

```typescript
import {
  ChatView,
  MessageBubble,
  ChatInput,
  FoldingTimelineViewer,
  TimelineBar,
  StepDetailsPanel,
} from '@/components/chat';
```

## ChatView

Main chat container component.

### Usage

```tsx
import { ChatView } from '@/components/chat';

export default function ChatPage() {
  return <ChatView />;
}
```

### Features
- Auto-creates conversation if none exists
- Empty state with centered large input
- Active state with scrollable messages
- Fixed bottom input area
- Auto-scrolls to latest message

### Props
None - uses Zustand store internally

---

## MessageBubble

Displays user messages.

### Usage

```tsx
import { MessageBubble } from '@/components/chat';

<MessageBubble message={chatMessage} />
```

### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| message | ChatMessage | Yes | Message object to display |

### Styling
- User messages: Right-aligned, purple background
- Assistant text: Left-aligned, gray background

---

## ChatInput

Input component with upload, text area, and send controls.

### Usage

```tsx
import { ChatInput } from '@/components/chat';

<ChatInput
  value={inputValue}
  onChange={setInputValue}
  onSend={handleSend}
  onFileUpload={handleUpload}
  placeholder="Type a message..."
/>
```

### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| value | string | Yes | Current input value |
| onChange | (value: string) => void | Yes | Input change handler |
| onSend | (value: string) => void | Yes | Send message handler |
| onFileUpload | (files: FileList \| null) => void | No | File upload handler |
| placeholder | string | No | Input placeholder text |
| large | boolean | No | Large mode for empty state |
| disabled | boolean | No | Disable input |

### Features
- Upload button for FASTA/PDB files
- Auto-resizing textarea
- Clear button (when text present)
- Send button (highlighted when ready)
- Keyboard shortcuts:
  - Enter: Send
  - Shift+Enter: New line

---

## FoldingTimelineViewer

Main timeline viewer showing folding progression.

### Usage

```tsx
import { FoldingTimelineViewer } from '@/components/chat';

<FoldingTimelineViewer
  steps={foldSteps}
  conversationId={conversationId}
/>
```

### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| steps | FoldStep[] | Yes | Array of folding steps |
| conversationId | string | Yes | ID for Mol* viewer key |
| className | string | No | Additional CSS classes |

### Layout
```
┌────────┬─────────────────┬──────────────┐
│Timeline│   Mol* Viewer   │Step Details  │
│  Bar   │   (3D Model)    │   Panel      │
│ (w-20) │   (flex-1)      │   (w-48)     │
└────────┴─────────────────┴──────────────┘
```

### Features
- Three-column responsive layout
- Integrated Mol* viewer
- Real-time step navigation
- Metrics display

---

## TimelineBar

Vertical timeline navigation component.

### Usage

```tsx
import { TimelineBar } from '@/components/chat';

<TimelineBar
  steps={steps}
  activeIndex={activeIndex}
  onStepClick={handleStepClick}
  onPrevious={handlePrevious}
  onNext={handleNext}
  canGoPrevious={canGoPrevious}
  canGoNext={canGoNext}
/>
```

### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| steps | FoldStep[] | Yes | All folding steps |
| activeIndex | number | Yes | Current active step index |
| onStepClick | (index: number) => void | Yes | Milestone click handler |
| onPrevious | () => void | Yes | Previous button handler |
| onNext | () => void | Yes | Next button handler |
| canGoPrevious | boolean | Yes | Enable previous button |
| canGoNext | boolean | Yes | Enable next button |

### Visual States

**Active Step**
- Size: 40px circle
- Color: Purple (`cf-accent`)
- Content: Step number
- Effect: Ring animation

**Completed Step**
- Size: 24px circle
- Color: Green (`cf-success`)
- Content: Checkmark icon
- Effect: Hover scale

**Pending Step**
- Size: 24px circle
- Color: Gray (`cf-border`)
- Content: Empty circle
- Effect: None

---

## StepDetailsPanel

Displays metrics for current folding step.

### Usage

```tsx
import { StepDetailsPanel } from '@/components/chat';

<StepDetailsPanel step={currentStep} />
```

### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| step | FoldStep \| null | Yes | Current step to display |
| className | string | No | Additional CSS classes |

### Metrics Displayed

1. **RMSD** (Root Mean Square Deviation)
   - Unit: Å (Angstroms)
   - Bar color: Purple
   - Range: 0-5 Å

2. **Energy**
   - Unit: kcal/mol
   - Bar color: Green
   - Range: -100 to 0

3. **Time**
   - Unit: ns (nanoseconds)
   - Display: Number only

4. **H-Bonds**
   - Unit: Count
   - Bar color: Blue
   - Range: 0-100

5. **Hydrophobic Contacts**
   - Unit: Count
   - Bar color: Orange
   - Range: 0-100

### Styling
- Glass-morphism card
- Semi-transparent background
- Backdrop blur effect
- Responsive text sizing

---

## Type Definitions

### FoldStep

```typescript
interface FoldStep {
  id: string;                    // Unique identifier
  stepNumber: number;            // Display number (1-based)
  status: 'completed' | 'active' | 'pending';
  structureId: string;           // Structure identifier
  label: string;                 // Display label
  stage: StageType;              // Folding stage
  metrics: {
    rmsd: number;                // 0-5 Å
    energy: number;              // kcal/mol
    time: number;                // ns
    hBonds: number;              // count
    hydrophobic: number;         // count
  };
  pdbData?: string;              // PDB file content
}
```

### StageType

```typescript
type StageType = 'QUEUED' | 'MSA' | 'MODEL' | 'RELAX' | 'QA' | 'DONE' | 'ERROR';
```

---

## Mock Data Utilities

### Generate Mock Steps

```typescript
import { generateMockFoldSteps } from '@/lib/mock/foldSteps';

const steps = generateMockFoldSteps(6); // 6 folding steps
```

### Generate Streaming Steps

```typescript
import { generateStreamingFoldSteps } from '@/lib/mock/foldSteps';

const cleanup = generateStreamingFoldSteps(
  (step) => {
    // Handle each step
    console.log('New step:', step);
  },
  2000,  // 2 second interval
  6      // Total steps
);

// Call cleanup when done
cleanup();
```

---

## Examples

### Full Chat Page

```tsx
'use client';

import { ChatView } from '@/components/chat';

export default function ChatPage() {
  return <ChatView />;
}
```

### Custom Timeline Viewer

```tsx
'use client';

import { useState } from 'react';
import { FoldingTimelineViewer } from '@/components/chat';
import { generateMockFoldSteps } from '@/lib/mock/foldSteps';

export default function TimelineDemo() {
  const [steps] = useState(() => generateMockFoldSteps(8));

  return (
    <div className="h-screen p-4">
      <FoldingTimelineViewer
        steps={steps}
        conversationId="demo"
      />
    </div>
  );
}
```

### Custom Input Component

```tsx
'use client';

import { useState } from 'react';
import { ChatInput } from '@/components/chat';

export default function InputDemo() {
  const [value, setValue] = useState('');

  const handleSend = (text: string) => {
    console.log('Sending:', text);
    setValue('');
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <ChatInput
        value={value}
        onChange={setValue}
        onSend={handleSend}
        placeholder="Type something..."
        large
      />
    </div>
  );
}
```

---

## Styling

All components use ChatFold design tokens:

```css
/* Import in your component */
import { cn } from '@/lib/utils';

/* Common patterns */
className={cn(
  'bg-cf-bg',              /* Background */
  'text-cf-text',          /* Text color */
  'border-cf-border',      /* Border color */
  'rounded-cf-lg',         /* Border radius */
)}
```

### Color Tokens
- `cf-accent`: #623b8b (Purple)
- `cf-success`: #67da7a (Green)
- `cf-text`: rgba(255, 255, 255, 0.8)
- `cf-text-secondary`: rgba(255, 255, 255, 0.6)
- `cf-text-muted`: rgba(255, 255, 255, 0.4)

### Radius Tokens
- `cf`: 6px
- `cf-md`: 8px
- `cf-lg`: 12px
- `cf-xl`: 16px

---

## Troubleshooting

### Timeline Not Showing
- Ensure `steps` array is not empty
- Check that steps have `pdbData` property
- Verify Mol* viewer dependencies are installed

### Mol* Viewer Not Loading
- Check browser console for errors
- Verify PDB data format is correct
- Ensure `structureId` is unique per step

### Input Not Sending
- Verify `onSend` handler is connected
- Check that input is not disabled
- Ensure value is not empty (trim whitespace)

### Metrics Not Updating
- Confirm active step is changing
- Check that metrics object has all required fields
- Verify step status is updating correctly

---

## Best Practices

1. **Always provide unique IDs** for steps and structures
2. **Use TypeScript** for type safety
3. **Memoize callbacks** to prevent unnecessary re-renders
4. **Handle loading states** when fetching real data
5. **Show error boundaries** for Mol* viewer failures
6. **Clean up resources** when components unmount
7. **Test with varying step counts** (1, 5, 10, 20 steps)

---

## Performance Tips

1. **Limit step count** to < 20 for optimal performance
2. **Lazy load PDB data** when possible
3. **Use single Mol* instance** per timeline
4. **Debounce rapid navigation** if users spam buttons
5. **Virtual scroll** for very long message lists

---

For more details, see:
- [CHAT_INTERFACE.md](../../../CHAT_INTERFACE.md) - Architecture details
- [IMPLEMENTATION_SUMMARY.md](../../../IMPLEMENTATION_SUMMARY.md) - Overview
