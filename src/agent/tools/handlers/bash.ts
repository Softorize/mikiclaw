import { execa } from 'execa';

export interface ToolExecutionContext {
  chatId?: number;
}

export interface BashResult {
  success: boolean;
  output?: string;
  error?: string;
}
