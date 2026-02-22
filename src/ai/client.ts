import { configManager } from "../config/manager.js";
import { logger } from "../utils/logger.js";

export type AIModel = 
  | "claude-sonnet-4-20250514" 
  | "claude-3-5-sonnet-20241022"
  | "claude-3-opus-20240229"
  | "kimi-k2.5"
  | "kimi-k2-thinking"
  | "MiniMax-M2.5"
  | "MiniMax-M2.5-highspeed"
  | "MiniMax-M2.1"
  | "gpt-4o"
  | "gpt-4o-mini"
  | "gpt-4-turbo"
  | "gpt-4"
  | "gpt-3.5-turbo"
  | "local-model";

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
  provider?: string;
  attempts?: string[];
  error?: string;
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

export type AIRoutingStrategy = "quality-first" | "speed-first" | "cost-first" | "balanced";
type TaskKind = "coding" | "summarization" | "tool-heavy" | "analysis" | "general";

export function detectTaskKind(messages: AIMessage[], tools?: AITool[]): TaskKind {
  const latestUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content.toLowerCase() || "";
  if (tools && tools.length > 0 && /(run|execute|tool|command|terminal|search|browse|file)/i.test(latestUserMessage)) {
    return "tool-heavy";
  }
  if (/(summarize|summary|tl;dr|brief|shorten|condense)/i.test(latestUserMessage)) {
    return "summarization";
  }
  if (/(code|bug|debug|typescript|javascript|python|build|test|refactor|function|class)/i.test(latestUserMessage)) {
    return "coding";
  }
  if (/(analyze|compare|tradeoff|architecture|design|plan|strategy)/i.test(latestUserMessage)) {
    return "analysis";
  }
  return "general";
}

function uniqueProviders(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

export function buildProviderPlan(options: {
  primary: string;
  strategy: AIRoutingStrategy;
  fallbackProviders: string[];
  availableProviders: string[];
  taskKind: TaskKind;
}): string[] {
  const { primary, strategy, fallbackProviders, availableProviders, taskKind } = options;

  const qualityOrder = ["anthropic", "openai", "kimi", "minimax", "local"];
  const speedOrder = ["openai", "minimax", "kimi", "anthropic", "local"];
  const costOrder = ["local", "minimax", "kimi", "openai", "anthropic"];

  let strategyOrder = qualityOrder;
  if (strategy === "speed-first") {
    strategyOrder = speedOrder;
  } else if (strategy === "cost-first") {
    strategyOrder = costOrder;
  }

  const taskBias: Record<TaskKind, string[]> = {
    coding: ["anthropic", "openai", "kimi"],
    summarization: ["openai", "anthropic", "minimax"],
    "tool-heavy": ["openai", "anthropic", "minimax"],
    analysis: ["anthropic", "openai", "kimi"],
    general: []
  };

  if (strategy === "balanced") {
    const ranked = uniqueProviders([
      primary,
      ...taskBias[taskKind],
      ...fallbackProviders,
      ...strategyOrder
    ]).filter((provider) => availableProviders.includes(provider));
    const primaryRest = ranked.filter((provider) => provider !== primary);
    return [primary, ...primaryRest];
  }

  return uniqueProviders([
    ...taskBias[taskKind],
    ...strategyOrder,
    primary,
    ...fallbackProviders
  ]).filter((provider) => availableProviders.includes(provider));
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
    const routing = configManager.getAIRoutingConfig();
    const availableProviders = Array.from(this.providers.keys());

    if (!routing.enabled) {
      const provider = this.providers.get(providerName);
      if (!provider) {
        throw new Error(`AI provider '${providerName}' not available`);
      }
      const response = await provider.createCompletion(messages, tools, systemPrompt);
      return { ...response, provider: providerName, attempts: [providerName] };
    }

    const taskKind = detectTaskKind(messages, tools);
    const providerPlan = buildProviderPlan({
      primary: providerName,
      strategy: routing.strategy,
      fallbackProviders: routing.fallbackProviders,
      availableProviders,
      taskKind
    });

    if (providerPlan.length === 0) {
      throw new Error("No AI providers are available for routing");
    }

    const failures: string[] = [];
    for (const plannedProvider of providerPlan) {
      const provider = this.providers.get(plannedProvider);
      if (!provider) {
        continue;
      }
      try {
        const model = config.ai?.model as AIModel || provider.models[0];
        logger.info("AI provider attempt", {
          provider: plannedProvider,
          strategy: routing.strategy,
          taskKind,
          model
        });
        const response = await provider.createCompletion(messages, tools, systemPrompt);
        return {
          ...response,
          provider: plannedProvider,
          attempts: [...failures, plannedProvider]
        };
      } catch (error) {
        const reason = `${plannedProvider}: ${error instanceof Error ? error.message : String(error)}`;
        failures.push(reason);
        logger.warn("AI provider failed, trying fallback", {
          provider: plannedProvider,
          strategy: routing.strategy,
          taskKind,
          error: reason
        });
      }
    }

    throw new Error(`All AI providers failed. Attempts: ${failures.join(" | ")}`);
  }

  getProvider(name: string): AIProvider | undefined {
    return this.providers.get(name);
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

export const aiClient = new AIClient();
