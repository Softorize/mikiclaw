import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';

export interface ToolExecutionContext {
  chatId?: number;
}

export interface FsResult {
  success: boolean;
  data?: unknown;
  error?: string;
}
