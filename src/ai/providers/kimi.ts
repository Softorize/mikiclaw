import { configManager } from "../../config/manager.js";
import type { AIProvider, AIMessage, AIResponse, AIModel, AITool } from "../client.js";

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

    try {
      const response = await fetch("https://api.moonshot.ai/v1/chat/completions", {
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
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Kimi API error: ${response.status} - ${error}`);
      }

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
      if (error instanceof Error && error.message.includes("Kimi API error")) {
        throw error;
      }
      throw new Error(`Kimi API error: ${error instanceof Error ? error.message : "Unknown"}`);
    }
  }
};
