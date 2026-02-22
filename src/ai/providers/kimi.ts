import { configManager } from "../../config/manager.js";
import type { AIProvider, AIMessage, AIResponse, AIModel, AITool } from "../client.js";
import { fetchWithRetry } from "../../utils/retry.js";
import { logger } from "../../utils/logger.js";

export const kimiProvider: AIProvider = {
  name: "kimi",
  models: ["kimi-k2.5", "kimi-k2-thinking"],

  async createCompletion(
    messages: AIMessage[],
    tools?:AITool[],
    systemPrompt?: string
  ): Promise<AIResponse> {
    const config = configManager.load();
    const apiKey = config.ai?.providers?.kimi?.apiKey;

    if (!apiKey) {
      throw new Error("Kimi API key not configured. Add 'ai.providers.kimi.apiKey' in config.");
    }

    const model = (config.ai?.model as AIModel) || "kimi-k2.5";

    const formattedMessages: Array<{ role: string; content: string }> = [];

    if (systemPrompt) {
      formattedMessages.push({ role: "system", content: systemPrompt });
    }

    for (const msg of messages) {
      if (!msg.content || msg.content.trim().length === 0) {
        continue;
      }
      formattedMessages.push({
        role: msg.role === "system" ? "system" : msg.role,
        content: msg.content
      });
    }

    const toolDefs = tools?.map(tool => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema
      }
    }));

    // Kimi API request body
    const requestBody: any = {
      model,
      messages: formattedMessages,
      // Kimi currently enforces temperature=1 for this model family.
      temperature: 1,
      max_tokens: 4096
    };

    // Only include tools if provided (Kimi may not support all tool features)
    if (toolDefs && toolDefs.length > 0) {
      requestBody.tools = toolDefs;
    }

    try {
      const response = await fetchWithRetry(
        "https://api.moonshot.ai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify(requestBody)
        },
        {
          maxRetries: 3,
          timeout: 120000,
          retryableStatusCodes: [408, 429, 500, 502, 503, 504]
        }
      );

      const data = await response.json() as any;

      const message = data.choices?.[0]?.message;

      if (!message) {
        throw new Error("No response from Kimi API");
      }

      let content = message.content || "";
      const toolCalls: AIResponse["toolCalls"] = [];

      if (message.tool_calls) {
        for (const call of message.tool_calls) {
          toolCalls.push({
            name: call.function.name,
            input: JSON.parse(call.function.arguments),
            id: call.id
          });
        }
      }

      return { content, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
    } catch (error) {
      let details = "";
      const response = (error as any)?.response as Response | undefined;
      if (response && !response.bodyUsed) {
        try {
          details = await response.text();
        } catch {
          // Ignore response body parsing failures
        }
      }

      logger.error("Kimi API error after retries", {
        error: String(error),
        details: details ? details.slice(0, 500) : undefined
      });

      if (error instanceof Error && error.message.includes("Kimi API error")) {
        throw error;
      }

      const errorMessage = details || (error instanceof Error ? error.message : "Unknown");
      throw new Error(`Kimi API error: ${errorMessage}`);
    }
  }
};
