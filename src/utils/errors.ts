export class MikiclawError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'MikiclawError';
  }
}

export class ValidationError extends MikiclawError {
  constructor(
    message: string,
    public readonly field?: string
  ) {
    super(message, 'VALIDATION_ERROR', { field });
    this.name = 'ValidationError';
  }
}

export class ConfigError extends MikiclawError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR');
    this.name = 'ConfigError';
  }
}

export class ToolExecutionError extends MikiclawError {
  constructor(
    message: string,
    public readonly toolName?: string
  ) {
    super(message, 'TOOL_EXECUTION_ERROR', { toolName });
    this.name = 'ToolExecutionError';
  }
}
