import { configManager } from "../config/manager.js";

export type AIModel = 
  | "claude-sonnet-4-20250514" 
  | "claude-3-5-sonnet-20241022"
  | "claude-3-opus-20240229"
  | "kimi-k2.5"
  | "kimi-k2-thinking"
  | "MiniMax-M2.5"
  | "MiniMax-M2.5-highspeed"
  | "MiniMax-M2.1";

export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AITool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface AIResponse {
  content: string;
  toolCalls?: Array<{
    name: string;
    input: Record<string, unknown>;
    id: string;
  }>;
}

export interface AIProvider {
  name: string;
  models: AIModel[];
  createCompletion(
    messages: AIMessage[],
    tools?:AITool[],
    systemPrompt?: string
  ): Promise<AIResponse>;
}

class AIClient {
  private providers: Map<string, AIProvider> = new Map();
  private defaultProvider: string = "anthropic";

  constructor() {
    this.registerDefaultProviders();
  }

  private registerDefaultProviders(): void {
    import("./providers/anthropic.js").then(({ anthropicProvider }) => {
      this.providers.set("anthropic", anthropicProvider);
    });
  }

  async registerProvider(name: string, provider: AIProvider): Promise<void> {
    this.providers.set(name, provider);
  }

  setDefaultProvider(name: string): void {
    if (!this.providers.has(name)) {
      throw new Error(`Provider '${name}' not found`);
    }
    this.defaultProvider = name;
  }

  async createCompletion(
    messages: AIMessage[],
    tools?:AITool[],
    systemPrompt?: string
  ): Promise<AIResponse> {
    const config = configManager.load();
    const providerName = config.ai?.provider || this.defaultProvider;
    
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`AI provider '${providerName}' not available`);
    }

    const model = config.ai?.model as AIModel || provider.models[0];
    
    return provider.createCompletion(messages, tools, systemPrompt);
  }

  getProvider(name: string): AIProvider | undefined {
    return this.providers.get(name);
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

export const aiClient = new AIClient();
