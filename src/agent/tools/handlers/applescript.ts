import { execa } from 'execa';

export interface ToolExecutionContext {
  chatId?: number;
}

export interface AppleScriptResult {
  success: boolean;
  output?: string;
  error?: string;
}
