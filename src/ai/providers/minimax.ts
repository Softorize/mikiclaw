import { configManager } from "../../config/manager.js";
import type { AIProvider, AIMessage, AIResponse, AIModel, AITool } from "../client.js";
import { fetchWithRetry } from "../../utils/retry.js";
import { logger } from "../../utils/logger.js";

export const minimaxProvider: AIProvider = {
  name: "minimax",
  models: ["MiniMax-M2.5", "MiniMax-M2.5-highspeed", "MiniMax-M2.1"],

  async createCompletion(
    messages: AIMessage[],
    tools?:AITool[],
    systemPrompt?: string
  ): Promise<AIResponse> {
    const config = configManager.load();
    const apiKey = config.ai?.providers?.minimax?.apiKey;
    const groupId = config.ai?.providers?.minimax?.groupId;

    if (!apiKey) {
      throw new Error("MiniMax API key not configured. Add 'ai.providers.minimax.apiKey' in config.");
    }

    if (!groupId) {
      throw new Error("MiniMax Group ID not configured. Add 'ai.providers.minimax.groupId' in config.");
    }

    const model = (config.ai?.model as AIModel) || "MiniMax-M2.5";

    const formattedMessages: Array<{ role: string; content: string }> = [];

    if (systemPrompt) {
      formattedMessages.push({ role: "system", content: systemPrompt });
    }

    for (const msg of messages) {
      formattedMessages.push({
        role: msg.role === "assistant" ? "assistant" : "user",
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

    const url = `https://api.minimax.chat/v1/text/chatcompletion_v2?GroupId=${groupId}`;

    try {
      const response = await fetchWithRetry(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            messages: formattedMessages,
            tools: toolDefs,
            temperature: 0.7,
            max_tokens: 4096
          })
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
        throw new Error("No response from MiniMax API");
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
      logger.error("MiniMax API error after retries", { error: String(error) });
      if (error instanceof Error && error.message.includes("MiniMax API error")) {
        throw error;
      }
      throw new Error(`MiniMax API error: ${error instanceof Error ? error.message : "Unknown"}`);
    }
  }
};
