import { Context } from "telegraf";
import { runAgent } from "../agent/runner.js";
import { 
  checkEasterEgg, 
  shouldTellJoke, 
  shouldTellFunFact, 
  getRandomResponse,
  getReaction 
} from "../personality/fun.js";

interface MessageContext {
  message: string;
  userId: string;
  username?: string;
  chatId: number;
  channel?: string;
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

  const easterEgg = checkEasterEgg(text);
  if (easterEgg) {
    if (easterEgg.reaction) {
      try {
        const emoji = getReaction(easterEgg.reaction as any);
        await ctx.react(emoji as any);
      } catch {}
    }
  }

  if (easterEgg?.response && Math.random() < 0.5) {
    await ctx.reply(easterEgg.response, { parse_mode: "Markdown" });
    return;
  }

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

    if (shouldTellJoke() && !response.toLowerCase().includes("joke")) {
      response += `\n\n${getRandomResponse("joke")}`;
    } else if (shouldTellFunFact() && !response.toLowerCase().includes("fact")) {
      response += `\n\n💡 Did you know? ${getRandomResponse("fact")}`;
    }

    await ctx.reply(response, {
      parse_mode: "Markdown"
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Agent error:", errorMessage);
    
    try {
      await ctx.react("😅" as any);
    } catch {}
    
    await ctx.reply(`❌ Sorry, something went wrong: ${errorMessage}`);
  }
}
