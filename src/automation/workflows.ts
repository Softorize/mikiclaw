import { configManager } from '../config/manager.js';
import { logger } from '../utils/logger.js';
import { memorySystem } from '../personality/memory.js';

type TriggerType = 'webhook' | 'heartbeat';

interface WorkflowExecutionHelpers {
  emitEvent?: (eventType: string, data: Record<string, unknown>) => Promise<void>;
}

function getByPath(payload: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.').filter(Boolean);
  let current: unknown = payload;

  for (const part of parts) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function renderTemplate(template: string, payload: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, path) => {
    const value = getByPath(payload, path);
    if (value === undefined || value === null) {
      return '';
    }
    return String(value);
  });
}

function matchesCondition(
  condition: { field?: string; equals?: string | number | boolean; contains?: string } | undefined,
  payload: Record<string, unknown>
): boolean {
  if (!condition || !condition.field) {
    return true;
  }

  const value = getByPath(payload, condition.field);
  if (value === undefined || value === null) {
    return false;
  }

  if (condition.equals !== undefined) {
    return String(value) === String(condition.equals);
  }

  if (condition.contains !== undefined) {
    return String(value).toLowerCase().includes(String(condition.contains).toLowerCase());
  }

  return true;
}

class WorkflowEngine {
  async run(
    triggerType: TriggerType,
    payload: Record<string, unknown>,
    helpers: WorkflowExecutionHelpers = {}
  ): Promise<{ matched: number; executed: number }> {
    const automation = configManager.getAutomationConfig();
    if (!automation.enabled) {
      return { matched: 0, executed: 0 };
    }

    let matched = 0;
    let executed = 0;

    for (const workflow of automation.workflows || []) {
      if (!workflow.enabled) {
        continue;
      }

      if (workflow.trigger.type !== triggerType) {
        continue;
      }

      if (triggerType === 'webhook' && workflow.trigger.path) {
        const path = String(payload.path || '');
        if (path !== workflow.trigger.path) {
          continue;
        }
      }

      if (triggerType === 'heartbeat' && workflow.trigger.taskName) {
        const taskName = String(payload.taskName || '');
        if (taskName !== workflow.trigger.taskName) {
          continue;
        }
      }

      if (!matchesCondition(workflow.condition, payload)) {
        continue;
      }

      matched += 1;

      try {
        await this.executeAction(workflow.action, payload, helpers);
        executed += 1;
      } catch (error) {
        logger.error('Workflow action failed', {
          workflowId: workflow.id,
          triggerType,
          error: String(error),
        });
      }
    }

    return { matched, executed };
  }

  private async executeAction(
    action: {
      type: 'emit_webhook_event' | 'log' | 'memory';
      eventType?: string;
      message?: string;
      importance?: number;
    },
    payload: Record<string, unknown>,
    helpers: WorkflowExecutionHelpers
  ): Promise<void> {
    if (action.type === 'log') {
      logger.info('Workflow log action', {
        message: action.message ? renderTemplate(action.message, payload) : 'workflow-log',
        payload,
      });
      return;
    }

    if (action.type === 'memory') {
      const memoryMessage = action.message
        ? renderTemplate(action.message, payload)
        : `Workflow memory event: ${JSON.stringify(payload).slice(0, 500)}`;

      memorySystem.addEntry({
        type: 'event',
        content: memoryMessage,
        importance: Math.max(1, Math.min(10, action.importance || 5)),
        tags: ['workflow', 'automation'],
        source: 'workflow',
      });
      return;
    }

    if (action.type === 'emit_webhook_event') {
      if (!helpers.emitEvent) {
        logger.warn('Workflow emit_webhook_event action skipped: no emitter configured');
        return;
      }

      const eventType = action.eventType || 'automation.workflow';
      await helpers.emitEvent(eventType, {
        ...payload,
        workflowMessage: action.message ? renderTemplate(action.message, payload) : undefined,
      });
    }
  }
}

export const workflowEngine = new WorkflowEngine();
