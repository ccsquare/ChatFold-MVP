import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from './store';

describe('AppStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useAppStore.setState({
      conversations: [],
      activeConversationId: null,
      folders: [],
      activeFolderId: null,
      sidebarWidth: 240,
      sidebarCollapsed: false,
      viewerTabs: [],
      activeTabId: null,
      consoleWidth: 410,
      consoleCollapsed: false,
      activeTask: null,
      isStreaming: false,
      thumbnails: {},
    });
  });

  describe('conversations', () => {
    it('should create a new conversation', () => {
      const id = useAppStore.getState().createConversation();

      expect(id).toMatch(/^conv_/);
      expect(useAppStore.getState().conversations).toHaveLength(1);
      expect(useAppStore.getState().activeConversationId).toBe(id);
    });

    it('should set active conversation', () => {
      const id = useAppStore.getState().createConversation();
      useAppStore.getState().createConversation();

      useAppStore.getState().setActiveConversation(id);

      expect(useAppStore.getState().activeConversationId).toBe(id);
    });

    it('should add messages to conversation', () => {
      const id = useAppStore.getState().createConversation();

      useAppStore.getState().addMessage(id, {
        role: 'user',
        content: 'Hello'
      });

      const conv = useAppStore.getState().conversations.find(c => c.id === id);
      expect(conv?.messages).toHaveLength(1);
      expect(conv?.messages[0].content).toBe('Hello');
      expect(conv?.messages[0].role).toBe('user');
    });

    it('should add assets to conversation', () => {
      const id = useAppStore.getState().createConversation();

      useAppStore.getState().addAsset(id, {
        name: 'test.pdb',
        type: 'pdb',
        content: 'ATOM...'
      });

      const conv = useAppStore.getState().conversations.find(c => c.id === id);
      expect(conv?.assets).toHaveLength(1);
      expect(conv?.assets[0].name).toBe('test.pdb');
    });
  });

  describe('viewer tabs', () => {
    it('should open a structure tab', () => {
      const structure = {
        type: 'structure' as const,
        structureId: 'str_1',
        label: 'candidate-1',
        filename: 'candidate_1.pdb',
        metrics: { plddtAvg: 85, paeAvg: 5 }
      };

      useAppStore.getState().openStructureTab(structure, 'PDB DATA');

      expect(useAppStore.getState().viewerTabs).toHaveLength(1);
      expect(useAppStore.getState().activeTabId).not.toBeNull();
    });

    it('should not duplicate tabs for the same structure', () => {
      const structure = {
        type: 'structure' as const,
        structureId: 'str_1',
        label: 'candidate-1',
        filename: 'candidate_1.pdb',
        metrics: { plddtAvg: 85, paeAvg: 5 }
      };

      useAppStore.getState().openStructureTab(structure, 'PDB DATA');
      useAppStore.getState().openStructureTab(structure, 'PDB DATA');

      expect(useAppStore.getState().viewerTabs).toHaveLength(1);
    });

    it('should close a tab and select the next one', () => {
      const structure1 = {
        type: 'structure' as const,
        structureId: 'str_1',
        label: 'candidate-1',
        filename: 'candidate_1.pdb',
        metrics: { plddtAvg: 85, paeAvg: 5 }
      };
      const structure2 = {
        type: 'structure' as const,
        structureId: 'str_2',
        label: 'candidate-2',
        filename: 'candidate_2.pdb',
        metrics: { plddtAvg: 80, paeAvg: 6 }
      };

      useAppStore.getState().openStructureTab(structure1, 'PDB DATA 1');
      const tab1Id = useAppStore.getState().activeTabId;
      useAppStore.getState().openStructureTab(structure2, 'PDB DATA 2');

      useAppStore.getState().closeTab(useAppStore.getState().activeTabId!);

      expect(useAppStore.getState().viewerTabs).toHaveLength(1);
      expect(useAppStore.getState().activeTabId).toBe(tab1Id);
    });

    it('should set active tab to null when closing the last tab', () => {
      const structure = {
        type: 'structure' as const,
        structureId: 'str_1',
        label: 'candidate-1',
        filename: 'candidate_1.pdb',
        metrics: { plddtAvg: 85, paeAvg: 5 }
      };

      useAppStore.getState().openStructureTab(structure, 'PDB DATA');
      useAppStore.getState().closeTab(useAppStore.getState().activeTabId!);

      expect(useAppStore.getState().viewerTabs).toHaveLength(0);
      expect(useAppStore.getState().activeTabId).toBeNull();
    });
  });

  describe('console', () => {
    it('should toggle console collapsed state', () => {
      expect(useAppStore.getState().consoleCollapsed).toBe(false);

      useAppStore.getState().setConsoleCollapsed(true);

      expect(useAppStore.getState().consoleCollapsed).toBe(true);
    });

    it('should set console width within bounds', () => {
      useAppStore.getState().setConsoleWidth(500);
      expect(useAppStore.getState().consoleWidth).toBe(500);

      // Test min bound
      useAppStore.getState().setConsoleWidth(100);
      expect(useAppStore.getState().consoleWidth).toBe(280);

      // Test max bound
      useAppStore.getState().setConsoleWidth(1000);
      expect(useAppStore.getState().consoleWidth).toBe(600);
    });
  });

  describe('tasks', () => {
    it('should set active task', () => {
      const task = {
        id: 'task_1',
        conversationId: 'conv_1',
        status: 'running' as const,
        sequence: 'MVLSPADKT',
        createdAt: Date.now(),
        steps: [],
        structures: []
      };

      useAppStore.getState().setActiveTask(task);

      expect(useAppStore.getState().activeTask).toEqual(task);
      expect(useAppStore.getState().isStreaming).toBe(true);
    });

    it('should add step events to task', () => {
      const task = {
        id: 'task_1',
        conversationId: 'conv_1',
        status: 'running' as const,
        sequence: 'MVLSPADKT',
        createdAt: Date.now(),
        steps: [],
        structures: []
      };

      useAppStore.getState().setActiveTask(task);
      useAppStore.getState().addStepEvent('task_1', {
        eventId: 'evt_1',
        taskId: 'task_1',
        ts: Date.now(),
        stage: 'MSA',
        status: 'running',
        progress: 20,
        message: 'Running MSA...'
      });

      expect(useAppStore.getState().activeTask?.steps).toHaveLength(1);
    });

    it('should add structure artifacts from step events', () => {
      const task = {
        id: 'task_1',
        conversationId: 'conv_1',
        status: 'running' as const,
        sequence: 'MVLSPADKT',
        createdAt: Date.now(),
        steps: [],
        structures: []
      };

      useAppStore.getState().setActiveTask(task);
      useAppStore.getState().addStepEvent('task_1', {
        eventId: 'evt_1',
        taskId: 'task_1',
        ts: Date.now(),
        stage: 'MODEL',
        status: 'running',
        progress: 60,
        message: 'Generated structure',
        artifacts: [{
          type: 'structure',
          structureId: 'str_1',
          label: 'candidate-1',
          filename: 'candidate_1.pdb',
          metrics: { plddtAvg: 85, paeAvg: 5 }
        }]
      });

      expect(useAppStore.getState().activeTask?.structures).toHaveLength(1);
    });

    it('should stop streaming when task is done', () => {
      const task = {
        id: 'task_1',
        conversationId: 'conv_1',
        status: 'running' as const,
        sequence: 'MVLSPADKT',
        createdAt: Date.now(),
        steps: [],
        structures: []
      };

      useAppStore.getState().setActiveTask(task);
      useAppStore.getState().addStepEvent('task_1', {
        eventId: 'evt_done',
        taskId: 'task_1',
        ts: Date.now(),
        stage: 'DONE',
        status: 'complete',
        progress: 100,
        message: 'Complete'
      });

      expect(useAppStore.getState().isStreaming).toBe(false);
      expect(useAppStore.getState().activeTask?.status).toBe('complete');
    });
  });

  describe('thumbnails', () => {
    it('should set thumbnails', () => {
      useAppStore.getState().setThumbnail('str_1', 'data:image/png;base64,abc123');

      expect(useAppStore.getState().thumbnails['str_1']).toBe('data:image/png;base64,abc123');
    });
  });
});
