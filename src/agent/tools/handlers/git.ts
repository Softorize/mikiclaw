import { execa } from 'execa';

export interface ToolExecutionContext {
  chatId?: number;
}

export interface GitResult {
  success: boolean;
  output?: string;
  error?: string;
}
