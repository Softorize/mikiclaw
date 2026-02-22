import { Context } from "telegraf";
import { runAgent } from "../agent/runner.js";
import { emotionalState } from "../personality/emotional_state.js";
import { memorySystem } from "../personality/memory.js";
import { socialGraph } from "../personality/social_graph.js";
import { UserProfiler } from "../personality/user_profiler.js";
import { configManager } from "../config/manager.js";
import { logger } from "../utils/logger.js";
import {
  checkEasterEgg,
  getReaction,
  getRandomGreeting,
  getRandomDadJoke,
  getRandomFunFact,
  getAdaptiveJoke,
  detectJokeReaction
} from "../personality/fun.js";

interface MessageContext {
  message: string;
  userId: string;
  username?: string;
  chatId: number;
  channel?: string;
}

async function transcribeVoiceWithOpenAI(audio: Buffer, filename: string): Promise<string> {
  const apiKey = configManager.load().ai?.providers?.openai?.apiKey;
  if (!apiKey) {
    throw new Error("Voice transcription needs an OpenAI API key in ai.providers.openai.apiKey");
  }

  const form = new FormData();
  form.append("model", "whisper-1");
  form.append("response_format", "json");
  form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/ogg" }), filename);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: form
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Transcription failed (${response.status}): ${details.slice(0, 300)}`);
  }

  const payload = await response.json() as { text?: string };
  if (!payload.text || !payload.text.trim()) {
    throw new Error("Transcription returned empty text");
  }

  return payload.text.trim();
}

async function replySafe(ctx: Context, text: string): Promise<void> {
  try {
    await ctx.reply(text, { parse_mode: "Markdown" });
  } catch (error) {
    const errorText = error instanceof Error ? error.message : String(error);
    if (errorText.includes("can't parse entities")) {
      // Fallback to plain text when model output contains invalid Markdown.
      await ctx.reply(text);
      return;
    }
    throw error;
  }
}

/**
 * Context-aware easter egg handler
 * Only triggers easter eggs when conversation mood is appropriate
 */
async function handleEasterEgg(ctx: Context, text: string, userId: string): Promise<boolean> {
  const easterEgg = checkEasterEgg(text);
  if (!easterEgg) return false;

  // Get current emotional state to decide if easter egg is appropriate
  const emotion = emotionalState.getCurrent(userId);
  
  // Don't interrupt serious conversations with easter eggs
  if (emotion.currentMood === "serious" || emotion.currentMood === "concerned") {
    // Only allow reactions, not text responses
    if (easterEgg.reaction) {
      try {
        const emoji = getReaction(easterEgg.reaction as any);
        await ctx.react(emoji as any);
      } catch {}
    }
    return false; // Don't send text response
  }

  // Add reaction if specified
  if (easterEgg.reaction) {
    try {
      const emoji = getReaction(easterEgg.reaction as any);
      await ctx.react(emoji as any);
    } catch {}
  }

  // Only send text response if mood is right and not too frequent
  if (easterEgg.response && emotion.valence > -0.2) {
    // Don't always respond to easter eggs - be unpredictable
    if (Math.random() < 0.4) {
      await replySafe(ctx, easterEgg.response);
      return true;
    }
  }

  return false;
}

/**
 * Add contextual personality touch based on emotional state
 * Uses adaptive humor based on user preferences
 */
async function addPersonalityTouch(response: string, userId: string): Promise<string> {
  // Skip if response already has personality elements
  if (response.includes("🎉") || response.includes("😂") || response.includes("💡")) {
    return response;
  }

  // Keep structured/tool outputs concise.
  if (response.length > 600 || response.includes("|") || /\n- /.test(response) || /\n\d+\./.test(response)) {
    return response;
  }

  const personalityCheck = emotionalState.shouldAddPersonalityTouch(userId);

  if (!personalityCheck.should) {
    return response;
  }

  let touch = "";

  // Get user's humor preference
  const profiler = new UserProfiler(userId);
  const preference = profiler.getHumorPreference();

  switch (personalityCheck.type) {
    case "joke":
      // Use adaptive joke selection based on learned preference
      touch = `\n\n😄 ${getAdaptiveJoke(preference, "dad")}`;
      break;

    case "fact":
      // Add interesting fact
      touch = `\n\n💡 By the way, did you know? ${getRandomFunFact()}`;
      break;

    case "greeting":
      // Warm closing for positive conversations
      touch = "\n\nLet me know if you need anything else! 🌟";
      break;
  }

  return response + touch;
}

export async function messageHandler(ctx: Context) {
  const text = ctx.message && "text" in ctx.message ? ctx.message.text : null;

  if (!text) {
    return;
  }

  if (text.startsWith("/")) {
    return;
  }

  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const userId = String(ctx.from?.id);
  const username = ctx.from?.username;

  // Handle easter eggs contextually
  const easterEggHandled = await handleEasterEgg(ctx, text, userId);
  if (easterEggHandled) {
    return;
  }

  // Update emotional state before processing
  emotionalState.detectFromMessage(userId, text);

  await ctx.sendChatAction("typing");

  const mctx: MessageContext = {
    message: text,
    userId,
    username,
    chatId,
    channel: "telegram"
  };

  try {
    let response = await runAgent(mctx);

    // Add contextual personality touch instead of random additions
    response = await addPersonalityTouch(response, userId);

    await replySafe(ctx, response);

    // Track that we successfully responded
    emotionalState.updateFromResponse(userId, response);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Agent error:", errorMessage);
    
    // Try to react with appropriate emotion
    try {
      const emotion = emotionalState.getCurrent(userId);
      if (emotion.valence < 0) {
        await ctx.react("💙" as any); // Supportive reaction
      } else {
        await ctx.react("😅" as any); // Light-hearted reaction
      }
    } catch {}
    
    // Personalized error message based on relationship length
    const profiler = memorySystem.getUserProfiler(userId);
    const profile = profiler.loadProfile();
    
    let errorResponse = "❌ Sorry, something went wrong";
    if (profile.style.interactionCount > 10) {
      errorResponse += `. I'm having a bit of trouble right now. Mind trying again?`;
    } else {
      errorResponse += `: ${errorMessage}`;
    }
    
    await ctx.reply(errorResponse);
  }
}

/**
 * Handler for voice messages - transcribe and process
 */
export async function voiceHandler(ctx: Context) {
  const voice = ctx.message && "voice" in ctx.message ? ctx.message.voice : null;
  if (!voice) {
    await ctx.reply("🎤 I couldn't read that voice message. Please try again.");
    return;
  }

  const chatId = ctx.chat?.id;
  if (!chatId) {
    await ctx.reply("❌ Chat context is missing for this voice message.");
    return;
  }

  const userId = String(ctx.from?.id);
  const username = ctx.from?.username;

  if (voice.file_size && voice.file_size > 24 * 1024 * 1024) {
    await ctx.reply("🎤 Voice file is too large for transcription (max ~24MB).");
    return;
  }

  await ctx.sendChatAction("typing");

  try {
    const fileLink = await ctx.telegram.getFileLink(voice.file_id);
    const audioResponse = await fetch(fileLink.toString());
    if (!audioResponse.ok) {
      throw new Error(`Failed to download voice file (${audioResponse.status})`);
    }

    const audioBytes = Buffer.from(await audioResponse.arrayBuffer());
    const transcript = await transcribeVoiceWithOpenAI(audioBytes, `${voice.file_unique_id || Date.now()}.ogg`);

    let response = await runAgent({
      message: transcript,
      userId,
      username,
      chatId
    });

    response = await addPersonalityTouch(response, userId);
    await replySafe(ctx, `🎤 *You said:* ${transcript}\n\n${response}`);
    emotionalState.updateFromResponse(userId, response);
  } catch (error) {
    logger.error("Voice handler failed", {
      error: String(error),
      userId,
      chatId
    });
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await ctx.reply(`❌ Voice processing failed: ${errorMessage}`);
  }
}

/**
 * Handler for new chat members - personalized greeting
 */
export async function newMemberHandler(ctx: Context) {
  const newMembers = ctx.message && "new_chat_members" in ctx.message 
    ? ctx.message.new_chat_members 
    : [];
  
  for (const member of newMembers) {
    if (member.is_bot) continue;
    
    const greeting = getRandomGreeting();
    await ctx.reply(
      `${greeting} Welcome, ${member.first_name}! I'm Miki, your AI assistant. ` +
      `Feel free to ask me anything or just chat! 🦞`,
      { parse_mode: "Markdown" }
    );
  }
}
