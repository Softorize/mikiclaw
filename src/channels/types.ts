export interface ChannelMessageContext {
  channel: string;
  chatId: number;
  userId: string;
  username?: string;
}

export interface ChannelAdapter<TInput> {
  readonly name: string;
  toMessageContext(input: TInput): ChannelMessageContext | null;
}
