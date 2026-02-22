import { configManager } from "../config/manager.js";
import { loadSoul } from "../personality/soul.js";
import { memorySystem } from "../personality/memory.js";
import { emotionalState } from "../personality/emotional_state.js";
import { aiVoice } from "../personality/voice.js";
import { socialGraph } from "../personality/social_graph.js";
import { patternDetector } from "../personality/patterns.js";
import { embeddingService } from "../personality/embeddings.js";
import { getTools } from "./tools.js";
import { rateLimiter } from "../utils/rate_limiter.js";
import { loopDetector } from "../utils/loop_detector.js";
import { isToolAllowed } from "../config/tool_policies.js";
import { logger } from "../utils/logger.js";
import { aiClient, AIMessage } from "../ai/client.js";
import { anthropicProvider } from "../ai/providers/anthropic.js";
import { kimiProvider } from "../ai/providers/kimi.js";
import { minimaxProvider } from "../ai/providers/minimax.js";
import { openaiProvider } from "../ai/providers/openai.js";
import { localProvider } from "../ai/providers/local.js";
import { sessionManager } from "../session/manager.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { execa } from "execa";
import { sanitizePath, validateCommand, validatePattern } from "../utils/validation.js";
import { accessControl } from "../security/access_control.js";

aiClient.registerProvider("anthropic", anthropicProvider);
aiClient.registerProvider("kimi", kimiProvider);
aiClient.registerProvider("minimax", minimaxProvider);
aiClient.registerProvider("openai", openaiProvider);
aiClient.registerProvider("local", localProvider);

interface MessageContext {
  message: string;
  userId: string;
  username?: string;
  chatId: number;
}

function extractLikelyUrl(message: string): string | null {
  const directUrl = message.match(/\bhttps?:\/\/[^\s)]+/i)?.[0];
  if (directUrl) {
    return directUrl;
  }

  const domainOnly = message.match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s)]*)?/i)?.[0];
  if (!domainOnly) {
    return null;
  }
  return domainOnly.startsWith("http://") || domainOnly.startsWith("https://")
    ? domainOnly
    : `https://${domainOnly}`;
}

function hasWebIntent(message: string): boolean {
  if (extractLikelyUrl(message)) {
    return true;
  }
  return /\b(search|web|internet|browse|open|visit|website|site|look up|find online|research|linkedin|profile url)\b/i.test(message);
}

function hasLocalMachineIntent(message: string): boolean {
  return /\b(applescript|osascript|mac|macos|finder|safari|frontmost|desktop|system events|open app|close app|volume|clipboard|gac|google analytics|ga4)\b/i.test(message);
}

function hasGacPropertiesIntent(message: string): boolean {
  return /\b(gac|google analytics|ga4)\b/i.test(message)
    && /\b(property|properties|account|accounts|list)\b/i.test(message);
}

function cleanUserFacingResponse(text: string): string {
  if (!text) {
    return text;
  }

  let cleaned = text
    .replace(/(^|\n)🔧 \*Executing:[^\n]*\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Strip leading "I'll do X" scaffolding when followed by actual results.
  cleaned = cleaned.replace(
    /^(?:I('|’)ll|Let me)\s.+?(?:\n\n|\n)(?=(?:📈|📊|✅|❌|- |\d+\. |\|))/i,
    ""
  ).trim();

  return cleaned;
}

function modelDeclinedBrowsing(content: string): boolean {
  return /(can't|cannot|unable|do not|don't).{0,120}(browse|open websites?|access websites?|browser tools?)/i.test(content)
    || /browser tools? (aren't|are not) available/i.test(content)
    || /not available in this environment/i.test(content);
}

function modelPretendsToolExecution(content: string): boolean {
  return /Executing:\s*(browser_|search|web_search|web_fetch|curl|read_file|write_file|bash|git|applescript|gac_list_accounts|gac_list_properties)\b/i.test(content)
    || /\b(browser_navigate|browser_content|browser_screenshot|browser_click|browser_type|browser_evaluate|applescript|gac_list_accounts|gac_list_properties)\b/i.test(content);
}

function extractAppleScriptFromContent(content: string): string | null {
  const fenced = content.match(/```applescript\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const inline = content.match(/osascript\s+-e\s+["'`]([\s\S]+?)["'`]/i);
  if (inline?.[1]) {
    return inline[1].trim();
  }

  return null;
}

function buildAppleScriptPathPrefix(): string {
  const home = process.env.HOME || "";
  const pathParts = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
    home ? `${home}/go/bin` : "",
    home ? `${home}/.local/bin` : "",
    home ? `${home}/.npm-global/bin` : ""
  ].filter(Boolean);
  return `export PATH=${pathParts.join(":")}; `;
}

function injectPathForDoShellScript(script: string): string {
  if (!/do\s+shell\s+script\s+"/i.test(script)) {
    return script;
  }
  if (/do\s+shell\s+script\s+"[^"]*(PATH=|\$PATH)/i.test(script)) {
    return script;
  }

  const prefix = buildAppleScriptPathPrefix().replace(/"/g, '\\"');
  return script.replace(/do\s+shell\s+script\s+"/gi, `do shell script "${prefix}`);
}

function buildRecoveryToolCalls(message: string): Array<{ name: string; input: Record<string, unknown>; id: string }> {
  const url = extractLikelyUrl(message);

  if (url) {
    return [
      { name: "browser_navigate", input: { url }, id: `recovery-nav-${Date.now()}` },
      { name: "browser_content", input: { maxChars: 6000 }, id: `recovery-content-${Date.now()}` }
    ];
  }

  return [
    { name: "search", input: { query: message.slice(0, 300) }, id: `recovery-search-${Date.now()}` }
  ];
}

/**
 * Build a dynamic system prompt that integrates:
 * - SOUL.md personality
 * - User's personalized memory context
 * - Emotional state awareness
 * - User communication style preferences
 */
async function buildSystemPrompt(userId: string, userMessage: string, username?: string, chatId?: number): Promise<string> {
  const soul = loadSoul();
  
  // Get comprehensive personalized context (includes memories, facts, preferences)
  const personalizedContext = await memorySystem.getPersonalizedContext(userId, userMessage);
  
  // Get user's communication style preferences
  const profiler = memorySystem.getUserProfiler(userId);
  const stylePrompt = profiler.getPersonalityPrompt();
  
  // Get current emotional state
  const emotion = emotionalState.getCurrent(userId);
  const energyLevel = emotion.arousal > 0.6 ? "high" : emotion.arousal > 0.3 ? "moderate" : "calm";
  
  // Get connected memories (semantically related)
  const connectedMemories = await memorySystem.getConnectedContext(userMessage, userId);
  
  // Get AI voice guidelines for consistency
  const voiceGuidelines = aiVoice.getVoiceGuidelines(userId);
  
  // Get pattern insights for current context
  const now = new Date();
  const relevantPatterns = patternDetector.getRelevantPatterns(userId, {
    timeOfDay: now.getHours(),
    dayOfWeek: now.getDay(),
    currentSentiment: emotion.valence
  });
  
  // Get pattern context
  const patternContext = relevantPatterns.length > 0
    ? relevantPatterns
        .slice(0, 3)
        .map(p => `- ${p.pattern.description}${p.suggestion ? ` (${p.suggestion})` : ""}`)
        .join("\n")
    : "";
  
  // Determine conversation mode based on emotional state
  const conversationMode = emotion.valence > 0.3 
    ? "positive and encouraging" 
    : emotion.valence < -0.3 
      ? "supportive and empathetic" 
      : "neutral and helpful";
  const machineControlGranted = chatId ? accessControl.hasAppleScriptAccess(userId, chatId) : false;

  return `You are an AI assistant with a distinct personality and memory. You are having a conversation with a specific user whose preferences and history you remember.

# Core Identity (SOUL.md)
${soul}

${personalizedContext ? `# User Context\n${personalizedContext}\n` : ""}

${connectedMemories ? `# Related Context\n${connectedMemories}\n` : ""}

${patternContext ? `# User Patterns\n${patternContext}\n` : ""}

# Communication Style Adaptations
${stylePrompt || "- Use a friendly, natural tone\n- Adapt to the user's communication style"}

# Your Voice Guidelines (Maintain Consistency)
${voiceGuidelines}

# Current Interaction Context
- Username/handle: ${username || "unknown"}
- Conversation mood: ${conversationMode}
- Energy level: ${energyLevel}
- User emotional state: ${emotion.currentMood}
- AppleScript machine control granted: ${machineControlGranted ? "yes" : "no"}

# Response Guidelines
- Reference previous conversations naturally when relevant (e.g., "I remember you mentioned...", "Last time we talked about...")
- ${emotion.valence > 0.3 ? "Match the user's positive energy" : emotion.valence < -0.3 ? "Be supportive and understanding" : "Be helpful and professional"}
- ${emotion.arousal > 0.6 ? "Keep responses energetic and engaging" : "Keep responses calm and focused"}
- Connect new information to what you know about the user
- If the user mentions something new that relates to past topics, make the connection
- Ask follow-up questions that show you're paying attention to their ongoing story
- For simple identity/social questions (e.g., "who am i", "what's my name", greetings), answer directly from chat metadata and memory. Do not run tools for these.

# Tool Usage
- You have access to tools. Use them when needed to help the user.
- Always explain what you're doing before executing a tool.
- If a tool fails, explain the error simply and suggest alternatives.
- For website/internet requests, use the web/browser tools directly. Do not claim you cannot browse when tools are available.
- Never fabricate tool execution logs or tool results. Only describe tool outputs that were actually returned.
- You can control macOS apps/files using the applescript tool only after the user grants access with /grant_access. If access is not granted, tell them how to grant it.
- If AppleScript machine control is granted and the user asks for a local Mac action, execute the applescript tool directly.
- For Google Analytics requests using gac, prefer gac_list_accounts / gac_list_properties over handcrafted shell chains.
- Return final results directly. Do not include "Executing" traces or internal step-by-step tool narration unless the user explicitly asks for it.
- Use Markdown formatting appropriately.
- For dangerous operations (file deletion, system changes), always ask for confirmation first.
`;
}

export async function runAgent(ctx: MessageContext): Promise<string> {
  if (!rateLimiter.isAllowed(ctx.userId)) {
    logger.warn("Rate limit exceeded", { userId: ctx.userId });
    return "⏳ Too many requests. Please wait a moment before trying again.";
  }

  if (!configManager.isConfigured()) {
    return "⚠️ AI not configured. Run `npm run setup`.";
  }

  const session = sessionManager.getOrCreateSession(ctx.chatId, ctx.userId, ctx.username);
  
  const loopCheck = loopDetector.detect(ctx.chatId);
  if (loopCheck.shouldStop) {
    logger.warn("Loop detected, stopping", { chatId: ctx.chatId, reason: loopCheck.reason });
    loopDetector.clearHistory(ctx.chatId);
    return `⛔ Detected a loop and stopped: ${loopCheck.reason}. Let's try something different!`;
  }
  if (loopCheck.warning) {
    logger.warn("Loop warning", { chatId: ctx.chatId, warning: loopCheck.warning });
  }

  // Update emotional state based on user message
  emotionalState.detectFromMessage(ctx.userId, ctx.message);
  
  const tools = getTools();
  const sessionContext = sessionManager.getContext(session.id);
  
  // Build dynamic system prompt with full context
  const systemPrompt = await buildSystemPrompt(ctx.userId, ctx.message, ctx.username, ctx.chatId);

  const messages: AIMessage[] = [
    ...sessionContext.filter((msg) => !!msg.content && msg.content.trim().length > 0),
    { role: "user", content: ctx.message }
  ];

  let response;
  const provider = configManager.getAIProvider();
  
  try {
    logger.info(`Calling ${provider} API`, { userId: ctx.userId, messageLength: ctx.message.length });
    response = await aiClient.createCompletion(messages, tools, systemPrompt);
    logger.info("Received response from AI", { userId: ctx.userId, hasContent: !!response.content });
  } catch (error) {
    logger.error("AI API error", { error: String(error), userId: ctx.userId, provider });
    return `❌ API Error (${provider}): ${error instanceof Error ? error.message : "Unknown"}`;
  }

  let finalText = response.content || "";

  if (
    (!response.toolCalls || response.toolCalls.length === 0)
    && hasWebIntent(ctx.message)
    && response.content
    && (modelDeclinedBrowsing(response.content) || modelPretendsToolExecution(response.content))
  ) {
    logger.warn("Model failed to use available browsing tools; applying recovery tool call", {
      userId: ctx.userId,
      chatId: ctx.chatId
    });
    response.toolCalls = buildRecoveryToolCalls(ctx.message);
    finalText = "Let me run that directly with real tools.";
  }

  if (
    (!response.toolCalls || response.toolCalls.length === 0)
    && !hasGacPropertiesIntent(ctx.message)
    && hasLocalMachineIntent(ctx.message)
    && response.content
    && accessControl.hasAppleScriptAccess(ctx.userId, ctx.chatId)
  ) {
    const extractedScript = extractAppleScriptFromContent(response.content);
    if (extractedScript) {
      logger.warn("Model provided AppleScript without tool call; executing via recovery path", {
        userId: ctx.userId,
        chatId: ctx.chatId
      });
      response.toolCalls = [
        {
          name: "applescript",
          input: { script: extractedScript },
          id: `recovery-applescript-${Date.now()}`
        }
      ];
      finalText = "Let me run that AppleScript directly.";
    }
  }

  if (
    (!response.toolCalls || response.toolCalls.length === 0)
    && hasGacPropertiesIntent(ctx.message)
    && accessControl.hasAppleScriptAccess(ctx.userId, ctx.chatId)
  ) {
    logger.warn("Model did not issue gac tool call; applying recovery tool call", {
      userId: ctx.userId,
      chatId: ctx.chatId
    });
    response.toolCalls = [
      {
        name: "gac_list_properties",
        input: {},
        id: `recovery-gac-properties-${Date.now()}`
      }
    ];
    finalText = "Let me fetch all your GA properties directly using gac.";
  }

  const toolConversation: AIMessage[] = [...messages];
  if (response.content && response.content.trim().length > 0) {
    toolConversation.push({ role: "assistant", content: response.content });
  }

  let pendingToolCalls = response.toolCalls || [];
  const maxToolRounds = 5;
  let toolRound = 0;
  let latestToolResult: string | null = null;

  while (pendingToolCalls.length > 0 && toolRound < maxToolRounds) {
    toolRound += 1;
    const batchContainsBrowserContent = pendingToolCalls.some((call) => call.name === "browser_content");
    logger.info("Processing tool round", {
      userId: ctx.userId,
      chatId: ctx.chatId,
      toolRound,
      toolCount: pendingToolCalls.length
    });

    for (const toolCall of pendingToolCalls) {
      const toolName = toolCall.name;
      const toolInput = toolCall.input;

      const toolCheck = isToolAllowed(toolName);
      if (!toolCheck.allowed) {
        logger.warn("Tool not allowed", { tool: toolName, reason: toolCheck.reason });
        const blockedMessage = `⛔ ${toolCheck.reason}`;
        finalText += `\n\n${blockedMessage}`;
        toolConversation.push({ role: "user", content: `Tool blocked (${toolName}): ${toolCheck.reason}` });
        continue;
      }

      logger.info("Executing tool", { tool: toolName, userId: ctx.userId, chatId: ctx.chatId });

      const result = await executeTool(toolName, toolInput, ctx.chatId, ctx.userId);
      latestToolResult = result;

      loopDetector.recordCall(ctx.chatId, toolName, toolInput, result.length);
      memorySystem.recordToolUsage(toolName, JSON.stringify(toolInput));
      toolConversation.push({ role: "user", content: `Tool result (${toolName}):\n${result}` });

      if (toolName === "browser_navigate" && !batchContainsBrowserContent) {
        const contentToolCheck = isToolAllowed("browser_content");
        if (contentToolCheck.allowed) {
          logger.info("Auto-running browser_content after browser_navigate", {
            userId: ctx.userId,
            chatId: ctx.chatId
          });
          const autoContent = await executeTool("browser_content", { maxChars: 6000 }, ctx.chatId, ctx.userId);
          latestToolResult = autoContent;

          loopDetector.recordCall(ctx.chatId, "browser_content", { maxChars: 6000 }, autoContent.length);
          memorySystem.recordToolUsage("browser_content", JSON.stringify({ maxChars: 6000 }));
          toolConversation.push({ role: "user", content: `Tool result (browser_content):\n${autoContent}` });

          const navigatedUrl = result.match(/Navigated to:\s*(\S+)/)?.[1] || "";
          const linkedInSlug = navigatedUrl.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1];
          const looksBlocked = autoContent.includes("about:blank") || autoContent.includes("(No text content found)");
          const searchToolCheck = isToolAllowed("search");

          if (linkedInSlug && looksBlocked && searchToolCheck.allowed) {
            const fallbackQuery = `${linkedInSlug.replace(/[-_]+/g, " ")} LinkedIn profile`;
            logger.info("Auto-running search fallback for blocked LinkedIn profile", {
              userId: ctx.userId,
              chatId: ctx.chatId,
              fallbackQuery
            });
            const fallbackSearch = await executeTool("search", { query: fallbackQuery }, ctx.chatId, ctx.userId);
            latestToolResult = fallbackSearch;
            loopDetector.recordCall(ctx.chatId, "search", { query: fallbackQuery }, fallbackSearch.length);
            memorySystem.recordToolUsage("search", JSON.stringify({ query: fallbackQuery }));
            toolConversation.push({ role: "user", content: `Tool result (search):\n${fallbackSearch}` });
          }
        }
      }
    }

    try {
      const followUp = await aiClient.createCompletion(toolConversation, tools, systemPrompt);
      const followUpContent = followUp.content && followUp.content.trim().length > 0
        ? followUp.content
        : "";

      let recoveredToolCalls: Array<{ name: string; input: Record<string, unknown>; id: string }> | null = null;
      if (
        (!followUp.toolCalls || followUp.toolCalls.length === 0)
        && followUpContent
        && modelPretendsToolExecution(followUpContent)
      ) {
        if (hasGacPropertiesIntent(ctx.message) && accessControl.hasAppleScriptAccess(ctx.userId, ctx.chatId)) {
          logger.warn("Follow-up response missed gac tool execution; forcing gac recovery call", {
            userId: ctx.userId,
            chatId: ctx.chatId,
            toolRound
          });
          recoveredToolCalls = [
            {
              name: "gac_list_properties",
              input: {},
              id: `recovery-followup-gac-properties-${Date.now()}`
            }
          ];
        } else if (hasLocalMachineIntent(ctx.message) && accessControl.hasAppleScriptAccess(ctx.userId, ctx.chatId)) {
          const extractedScript = extractAppleScriptFromContent(followUpContent);
          if (extractedScript) {
            logger.warn("Follow-up response pretended AppleScript execution; forcing real tool call", {
              userId: ctx.userId,
              chatId: ctx.chatId,
              toolRound
            });
            recoveredToolCalls = [
              {
                name: "applescript",
                input: { script: extractedScript },
                id: `recovery-followup-applescript-${Date.now()}`
              }
            ];
          }
        } else if (hasWebIntent(ctx.message)) {
          logger.warn("Follow-up response pretended web tool execution; forcing recovery tool calls", {
            userId: ctx.userId,
            chatId: ctx.chatId,
            toolRound
          });
          recoveredToolCalls = buildRecoveryToolCalls(ctx.message);
        }
      }

      if (followUpContent && !recoveredToolCalls) {
        finalText += (finalText ? "\n\n" : "") + followUpContent;
        toolConversation.push({ role: "assistant", content: followUpContent });
      }
      pendingToolCalls = recoveredToolCalls || followUp.toolCalls || [];
    } catch (e) {
      logger.error("Follow-up API call failed", { error: String(e), chatId: ctx.chatId, toolRound });
      break;
    }
  }

  if (pendingToolCalls.length > 0) {
    logger.warn("Stopping tool execution after max rounds", {
      userId: ctx.userId,
      chatId: ctx.chatId,
      remainingCalls: pendingToolCalls.length
    });
    finalText += "\n\n⚠️ I stopped tool execution after several steps to avoid a loop. Please ask me to continue if needed.";
  }

  if (hasGacPropertiesIntent(ctx.message) && latestToolResult) {
    finalText = latestToolResult;
  } else if (latestToolResult && finalText.length > 2500 && /^📈|^📊/.test(latestToolResult.trim())) {
    finalText = latestToolResult;
  }

  if ((!finalText || finalText.trim().length === 0) && latestToolResult) {
    finalText = latestToolResult;
  }

  finalText = cleanUserFacingResponse(finalText);

  if (!finalText || finalText.trim().length === 0) {
    if (hasLocalMachineIntent(ctx.message) && !accessControl.hasAppleScriptAccess(ctx.userId, ctx.chatId)) {
      finalText = "🔒 I need local machine permission first. Send /grant_access, then ask again.";
    } else {
      finalText = "❌ I hit an internal response issue. Please try again.";
    }
  }

  // Store interaction
  sessionManager.addMessage(session.id, "user", ctx.message);
  sessionManager.addMessage(session.id, "assistant", finalText);
  memorySystem.trackInteraction(ctx.chatId);
  
  // Extract and store user facts from this interaction
  memorySystem.extractUserFacts(ctx.userId, ctx.message, finalText);
  
  // Learn from this interaction for style adaptation
  memorySystem.learnFromInteraction(ctx.userId, ctx.message, finalText);
  
  // Update emotional state based on AI response
  emotionalState.updateFromResponse(ctx.userId, finalText);
  
  // Track AI voice consistency
  aiVoice.analyzeResponse(ctx.userId, finalText);
  
  // Record activity for pattern detection
  patternDetector.recordActivity(ctx.userId, "message", {
    sentiment: emotionalState.getCurrent(ctx.userId).valence
  });
  
  // Track in social graph (for group contexts)
  socialGraph.trackInteraction(ctx.userId, ctx.chatId, {
    username: ctx.username,
    sentiment: emotionalState.getCurrent(ctx.userId).valence
  });

  return finalText;
}

function resolveWorkspacePath(pathInput: string): { ok: true; absolutePath: string; relativePath: string } | { ok: false; error: string } {
  const sanitized = sanitizePath(pathInput, { allowAbsolute: false });
  if (!sanitized.valid) {
    return { ok: false, error: sanitized.error || "Invalid path" };
  }

  const workspaceRoot = configManager.getWorkspacePath();
  return {
    ok: true,
    absolutePath: join(workspaceRoot, sanitized.path),
    relativePath: sanitized.path
  };
}

async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  chatId?: number,
  userId?: string
): Promise<string> {
  switch (toolName) {
    case "bash": {
      const command = input.command as string;
      if (!command) return "Error: No command provided";

      const commandValidation = validateCommand(command);
      if (!commandValidation.valid) {
        logger.warn("Rejected unsafe command", { command, reason: commandValidation.error });
        return `⛔ ${commandValidation.error}`;
      }

      if (!configManager.isCommandAllowed(command)) {
        logger.warn("Blocked command", { command });
        return "⛔ This command has been blocked for safety.";
      }

      const timeout = (input.timeout as number) || 30;
      const workspacePath = configManager.getWorkspacePath();

      try {
        const { stdout, stderr } = await execa("bash", ["-c", command], {
          timeout: timeout * 1000,
          cwd: workspacePath,
          stdio: "pipe"
        });
        return stdout || stderr || "(no output)";
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
      }
    }

    case "applescript": {
      const scriptInput = input.script as string;
      if (!scriptInput) return "Error: No script provided";
      if (scriptInput.length > 8000) return "⛔ AppleScript is too long (max 8000 chars)";

      if (process.platform !== "darwin") {
        return "⛔ AppleScript tool is only available on macOS.";
      }

      if (!chatId || !userId) {
        return "⛔ Missing chat/user context for AppleScript permission checks.";
      }

      if (!accessControl.hasAppleScriptAccess(userId, chatId)) {
        return "⛔ AppleScript access is not granted for this chat. Ask the user to send /grant_access first.";
      }

      const timeout = (input.timeout as number) || 20;
      const script = injectPathForDoShellScript(scriptInput);
      const home = process.env.HOME || "";
      const extendedPath = [
        process.env.PATH || "",
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
        home ? `${home}/go/bin` : "",
        home ? `${home}/.local/bin` : "",
        home ? `${home}/.npm-global/bin` : ""
      ].filter(Boolean).join(":");

      try {
        const { stdout, stderr } = await execa("osascript", ["-e", script], {
          timeout: Math.max(5, Math.min(timeout, 120)) * 1000,
          stdio: "pipe",
          env: {
            ...process.env,
            PATH: extendedPath
          }
        });
        return stdout || stderr || "(no output)";
      } catch (error) {
        return `AppleScript error: ${error instanceof Error ? error.message : "Unknown error"}`;
      }
    }

    case "git": {
      const command = "git " + (input.command as string);
      const repoPathInput = (input.repoPath as string) || ".";
      const resolvedRepoPath = resolveWorkspacePath(repoPathInput);

      if (!resolvedRepoPath.ok) {
        return `⛔ ${resolvedRepoPath.error}`;
      }

      if (!configManager.isCommandAllowed(command)) {
        return "⛔ This command has been blocked for safety.";
      }

      try {
        const { stdout, stderr } = await execa("git", (input.command as string).split(" "), {
          cwd: resolvedRepoPath.absolutePath,
          timeout: 30000,
          stdio: "pipe"
        });
        return stdout || stderr || "(no output)";
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
      }
    }

    case "read_file": {
      const pathInput = input.path as string;
      if (!pathInput) return "Error: No path provided";

      const resolvedPath = resolveWorkspacePath(pathInput);
      if (!resolvedPath.ok) {
        return `⛔ ${resolvedPath.error}`;
      }
      
      try {
        const stats = statSync(resolvedPath.absolutePath);
        if (!stats.isFile()) {
          return "Error reading file: path is not a file";
        }

        const limit = Math.max(1, Math.min((input.limit as number) || 100, 1000));
        const offset = Math.max(1, (input.offset as number) || 1);
        
        let content = readFileSync(resolvedPath.absolutePath, "utf-8");
        const lines = content.split("\n");
        
        if (offset > 1) {
          content = lines.slice(offset - 1, offset - 1 + limit).join("\n");
        } else {
          content = lines.slice(0, limit).join("\n");
        }
        
        return content + `\n\n--- (showing ${Math.min(limit, lines.length)} lines) ---`;
      } catch (error) {
        return `Error reading file: ${error instanceof Error ? error.message : "Unknown"}`;
      }
    }

    case "write_file": {
      const pathInput = input.path as string;
      const content = input.content as string;
      
      if (!pathInput || content === undefined) return "Error: Missing path or content";

      const resolvedPath = resolveWorkspacePath(pathInput);
      if (!resolvedPath.ok) {
        return `⛔ ${resolvedPath.error}`;
      }
      
      try {
        const dir = dirname(resolvedPath.absolutePath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        writeFileSync(resolvedPath.absolutePath, content);
        return `✅ File written: ${resolvedPath.relativePath}`;
      } catch (error) {
        return `Error writing file: ${error instanceof Error ? error.message : "Unknown"}`;
      }
    }

    case "list_directory": {
      const pathInput = (input.path as string) || ".";
      const resolvedPath = resolveWorkspacePath(pathInput);
      if (!resolvedPath.ok) {
        return `⛔ ${resolvedPath.error}`;
      }
      
      try {
        const { execa } = await import("execa");
        const { stdout } = await execa("ls", ["-la", resolvedPath.absolutePath]);
        return stdout || "(empty directory)";
      } catch (error) {
        return `Error listing directory: ${error instanceof Error ? error.message : "Unknown"}`;
      }
    }

    case "glob": {
      const pattern = input.pattern as string;
      const basePathInput = (input.path as string) || ".";
      
      if (!pattern) return "Error: No pattern provided";
      const patternValidation = validatePattern(pattern, 200);
      if (!patternValidation.valid) {
        return `⛔ ${patternValidation.error}`;
      }

      const resolvedBasePath = resolveWorkspacePath(basePathInput);
      if (!resolvedBasePath.ok) {
        return `⛔ ${resolvedBasePath.error}`;
      }
      
      try {
        const { execa } = await import("execa");
        const { stdout } = await execa("find", [resolvedBasePath.absolutePath, "-type", "f", "-name", pattern]);
        const files = stdout.split("\n").filter(Boolean).slice(0, 50);
        return files.length > 0 ? files.join("\n") : "No files found";
      } catch {
        return "Error running glob";
      }
    }

    case "grep": {
      const pattern = input.pattern as string;
      const pathInput = (input.path as string) || ".";
      const caseSensitive = input.caseSensitive !== false;
      
      if (!pattern) return "Error: No pattern provided";

      const patternValidation = validatePattern(pattern, 200);
      if (!patternValidation.valid) {
        return `⛔ ${patternValidation.error}`;
      }

      const resolvedPath = resolveWorkspacePath(pathInput);
      if (!resolvedPath.ok) {
        return `⛔ ${resolvedPath.error}`;
      }
      
      try {
        const { execa } = await import("execa");
        const args = caseSensitive ? ["-r", pattern, resolvedPath.absolutePath] : ["-ri", pattern, resolvedPath.absolutePath];
        const { stdout, stderr } = await execa("grep", args);
        const lines = (stdout || stderr).split("\n").slice(0, 50);
        return lines.length > 0 ? lines.join("\n") : "No matches found";
      } catch {
        return "No matches found or error running grep";
      }
    }

    case "search": {
      const query = input.query as string;
      if (!query) return "Error: No query provided";
      
      const { webSearch } = await import("./web_search.js");
      return await webSearch(query);
    }

    case "browser_navigate": {
      const url = input.url as string;
      if (!url) return "Error: No URL provided";

      const { browserNavigate } = await import("../tools/browser_session.js");
      return await browserNavigate(url, chatId ? String(chatId) : undefined);
    }

    case "browser_click": {
      const selector = input.selector as string;
      if (!selector) return "Error: No selector provided";

      const { browserClick } = await import("../tools/browser_session.js");
      return await browserClick(selector, chatId ? String(chatId) : undefined);
    }

    case "browser_type": {
      const selector = input.selector as string;
      const text = input.text as string;
      if (!selector || text === undefined) return "Error: Missing selector or text";

      const { browserType } = await import("../tools/browser_session.js");
      return await browserType(selector, text, chatId ? String(chatId) : undefined);
    }

    case "browser_content": {
      const maxCharsRaw = input.maxChars as number | undefined;
      const maxChars = typeof maxCharsRaw === "number" ? maxCharsRaw : 6000;

      const { browserContent } = await import("../tools/browser_session.js");
      return await browserContent(maxChars, chatId ? String(chatId) : undefined);
    }

    case "browser_screenshot": {
      const fullPage = input.fullPage === true;

      const { browserScreenshot } = await import("../tools/browser_session.js");
      return await browserScreenshot(fullPage, chatId ? String(chatId) : undefined);
    }

    case "browser_evaluate": {
      const script = input.script as string;
      if (!script) return "Error: No script provided";

      const { browserEvaluate } = await import("../tools/browser_session.js");
      return await browserEvaluate(script, chatId ? String(chatId) : undefined);
    }

    case "browser_fill": {
      const fields = input.fields;
      if (fields === undefined) return "Error: No fields provided";

      const { browserFill } = await import("../tools/browser_session.js");
      return await browserFill(fields, chatId ? String(chatId) : undefined);
    }

    case "browser_select": {
      const selector = input.selector as string;
      const value = input.value as string;
      if (!selector || !value) return "Error: Missing selector or value";

      const { browserSelect } = await import("../tools/browser_session.js");
      return await browserSelect(selector, value, chatId ? String(chatId) : undefined);
    }

    case "browser_scroll": {
      const direction = (input.direction as string) || "down";
      const amountRaw = input.amount;
      const amount = typeof amountRaw === "number" ? amountRaw : 800;

      const { browserScroll } = await import("../tools/browser_session.js");
      return await browserScroll(direction, amount, chatId ? String(chatId) : undefined);
    }

    case "browser_back": {
      const { browserBack } = await import("../tools/browser_session.js");
      return await browserBack(chatId ? String(chatId) : undefined);
    }

    case "browser_forward": {
      const { browserForward } = await import("../tools/browser_session.js");
      return await browserForward(chatId ? String(chatId) : undefined);
    }

    case "browser_snapshot": {
      const maxCharsRaw = input.maxChars as number | undefined;
      const maxChars = typeof maxCharsRaw === "number" ? maxCharsRaw : 5000;

      const { browserSnapshot } = await import("../tools/browser_session.js");
      return await browserSnapshot(maxChars, chatId ? String(chatId) : undefined);
    }

    case "gac_list_accounts": {
      if (!chatId || !userId) {
        return "⛔ Missing chat/user context for local access checks.";
      }
      if (!accessControl.hasAppleScriptAccess(userId, chatId)) {
        return "⛔ Local machine access is not granted. Ask the user to send /grant_access first.";
      }

      const { gacListAccounts } = await import("../tools/gac.js");
      return await gacListAccounts();
    }

    case "gac_list_properties": {
      if (!chatId || !userId) {
        return "⛔ Missing chat/user context for local access checks.";
      }
      if (!accessControl.hasAppleScriptAccess(userId, chatId)) {
        return "⛔ Local machine access is not granted. Ask the user to send /grant_access first.";
      }

      const accountId = input.accountId as string | undefined;
      const { gacListProperties } = await import("../tools/gac.js");
      return await gacListProperties(accountId);
    }

    case "get_system_info": {
      const os = await import("os");
      const cpus = os.cpus();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      
      return `
*System Information*
- OS: ${os.platform()} ${os.release()}
- CPU: ${cpus[0]?.model || "Unknown"} (${cpus.length} cores)
- Memory: ${Math.round((totalMem - freeMem) / 1024 / 1024)}MB / ${Math.round(totalMem / 1024 / 1024)}MB
- Home: ${os.homedir()}
- Hostname: ${os.hostname()}
- Uptime: ${Math.floor(os.uptime() / 3600)} hours
`.trim();
    }

    case "nodejs": {
      return "⛔ The nodejs tool is disabled for security. Use vetted tools like read_file, write_file, grep, glob, or bash with the command policy.";
    }

    default:
      return `Error: Unknown tool: ${toolName}`;
  }
}
