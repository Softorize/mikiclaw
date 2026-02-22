import Anthropic from "@anthropic-ai/sdk";
import { configManager } from "../../config/manager.js";
import type { AIProvider, AIMessage, AIResponse, AIModel, AITool } from "../client.js";
import { withRetry } from "../../utils/retry.js";
import { logger } from "../../utils/logger.js";

export const anthropicProvider: AIProvider = {
  name: "anthropic",
  models: [
    "claude-sonnet-4-20250514",
    "claude-3-5-sonnet-20241022",
    "claude-3-opus-20240229"
  ],

  async createCompletion(
    messages: AIMessage[],
    tools?: AITool[],
    systemPrompt?: string
  ): Promise<AIResponse> {
    const apiKey = configManager.getAnthropicKey();
    if (!apiKey) {
      throw new Error("Anthropic API key not configured");
    }

    const config = configManager.load();
    const model = (config.ai?.model as AIModel) || "claude-sonnet-4-20250514";

    const anthropic = new Anthropic({
      apiKey,
      timeout: 60000,
      maxRetries: 0
    });

    const conversationMessages = messages
      .filter(message => message.role === "user" || message.role === "assistant")
      .map(message => ({
        role: message.role,
        content: message.content
      }));

    if (conversationMessages.length === 0) {
      conversationMessages.push({ role: "user", content: "" });
    }

    try {
      const response = await withRetry(
        () => anthropic.messages.create({
          model,
          max_tokens: 4096,
          system: systemPrompt || "",
          messages: conversationMessages as any,
          tools: tools as any
        }),
        {
          maxRetries: 3,
          timeout: 120000,
          shouldRetry: (error) => {
            const msg = error.message.toLowerCase();
            if (msg.includes("authentication") || msg.includes("api key")) {
              return false;
            }
            return true;
          }
        }
      );

      let content = "";
      const toolCalls: AIResponse["toolCalls"] = [];

      for (const block of response.content) {
        if (block.type === "text") {
          content += block.text;
        } else if (block.type === "tool_use") {
          toolCalls.push({
            name: block.name,
            input: block.input as Record<string, unknown>,
            id: block.id
          });
        }
      }

      return { content, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
    } catch (error) {
      logger.error("Anthropic API error after retries", { error: String(error) });
      throw new Error(`Anthropic API error: ${error instanceof Error ? error.message : "Unknown"}`);
    }
  }
};
