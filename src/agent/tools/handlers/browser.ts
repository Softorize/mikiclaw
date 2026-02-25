export interface ToolExecutionContext {
  chatId?: number;
  sessionId?: string;
}

export interface BrowserAction {
  type:
    | 'navigate'
    | 'screenshot'
    | 'click'
    | 'type'
    | 'content'
    | 'evaluate'
    | 'fill'
    | 'select'
    | 'scroll'
    | 'back'
    | 'forward'
    | 'snapshot';
  payload?: Record<string, unknown>;
}

export interface BrowserResult {
  success: boolean;
  data?: unknown;
  error?: string;
  sessionId?: string;
}
