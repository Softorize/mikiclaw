import { configManager } from "../../config/manager.js";
import type { AIProvider, AIMessage, AIResponse, AITool } from "../client.js";

export const localProvider: AIProvider = {
  name: "local",
  models: ["local-model"],

  async createCompletion(
    messages: AIMessage[],
    tools?: AITool[],
    systemPrompt?: string
  ): Promise<AIResponse> {
    const config = configManager.load();
    const baseUrl = config.ai?.providers?.local?.baseUrl || "http://localhost:8000/v1";
    const apiKey = config.ai?.providers?.local?.apiKey || "not-needed";
    const model = config.ai?.model || "local-model";

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
      const response = await fetch(`${baseUrl}/chat/completions`, {
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
        const errorText = await response.text();
        throw new Error(`Local API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as any;
      
      const message = data.choices?.[0]?.message;
      
      if (!message) {
        throw new Error("No response from local API");
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
      if (error instanceof Error && error.message.includes("Local API error")) {
        throw error;
      }
      throw new Error(`Local API connection failed: ${error instanceof Error ? error.message : "Unknown"}. Make sure your local LLM server is running at ${baseUrl}`);
    }
  }
};
