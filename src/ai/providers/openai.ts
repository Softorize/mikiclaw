import { configManager } from "../../config/manager.js";
import type { AIProvider, AIMessage, AIResponse, AIModel, AITool } from "../client.js";

export const openaiProvider: AIProvider = {
  name: "openai",
  models: [
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "gpt-4",
    "gpt-3.5-turbo"
  ],

  async createCompletion(
    messages: AIMessage[],
    tools?:AITool[],
    systemPrompt?: string
  ): Promise<AIResponse> {
    const config = configManager.load();
    const apiKey = config.ai?.providers?.openai?.apiKey;
    
    if (!apiKey) {
      throw new Error("OpenAI API key not configured. Add 'ai.providers.openai.apiKey' in config.");
    }

    const model = (config.ai?.model as AIModel) || "gpt-4o";

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
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
        throw new Error(`OpenAI API error: ${response.status} - ${error}`);
      }

      const data = await response.json() as any;
      
      const message = data.choices?.[0]?.message;
      
      if (!message) {
        throw new Error("No response from OpenAI API");
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
      if (error instanceof Error && error.message.includes("OpenAI API error")) {
        throw error;
      }
      throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : "Unknown"}`);
    }
  }
};
