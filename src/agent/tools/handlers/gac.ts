export interface ToolExecutionContext {
  chatId?: number;
}

export interface GacResult {
  success: boolean;
  data?: unknown;
  error?: string;
}
