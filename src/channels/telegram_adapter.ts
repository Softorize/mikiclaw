import { Context } from "telegraf";
import { ChannelAdapter, ChannelMessageContext } from "./types.js";

class TelegramAdapter implements ChannelAdapter<Context> {
  readonly name = "telegram";

  toMessageContext(ctx: Context): ChannelMessageContext | null {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id ? String(ctx.from.id) : "";
    if (!chatId || !userId) {
      return null;
    }

    return {
      channel: this.name,
      chatId,
      userId,
      username: ctx.from?.username
    };
  }
}

export const telegramAdapter = new TelegramAdapter();
