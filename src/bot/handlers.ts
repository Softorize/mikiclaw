import { Context } from "telegraf";
import { runAgent } from "../agent/runner.js";

interface MessageContext {
  message: string;
  userId: string;
  username?: string;
  chatId: number;
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

  await ctx.sendChatAction("typing");

  const mctx: MessageContext = {
    message: text,
    userId,
    username,
    chatId
  };

  try {
    const response = await runAgent(mctx);
    
    await ctx.reply(response, {
      parse_mode: "Markdown"
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Agent error:", errorMessage);
    await ctx.reply(`❌ Sorry, something went wrong: ${errorMessage}`);
  }
}
