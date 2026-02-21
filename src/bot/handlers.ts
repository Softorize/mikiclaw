import { Context } from "telegraf";
import { runAgent } from "../agent/runner.js";
import { emotionalState } from "../personality/emotional_state.js";
import { memorySystem } from "../personality/memory.js";
import { socialGraph } from "../personality/social_graph.js";
import { UserProfiler } from "../personality/user_profiler.js";
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
      await ctx.reply(easterEgg.response, { parse_mode: "Markdown" });
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

    await ctx.reply(response, {
      parse_mode: "Markdown"
    });

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
  // TODO: Implement voice transcription
  await ctx.reply("🎤 I heard your voice message! Voice support is coming soon.");
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
