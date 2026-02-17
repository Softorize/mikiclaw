# 🦞 mikiclaw

Your personal AI assistant with Telegram interface, ClawHub skills, and SOUL.md personality.

Inspired by [OpenClaw](https://openclaw.ai) and built with the same philosophy - a self-hosted AI agent that you control.

## Features

- **🤖 Telegram Bot** - Chat with your AI assistant on Telegram
- **🧠 Claude AI** - Powered by Anthropic's Claude API
- **📦 ClawHub Skills** - Extend capabilities with skills from ClawHub
- **💫 SOUL.md Personality** - Define your assistant's personality
- **❤️ Heartbeat** - Scheduled tasks and check-ins
- **🔒 Self-Hosted** - Your data stays on your machine

## Quick Start

### 1. Install

```bash
git clone https://github.com/Softorize/mikiclaw
cd mikiclaw
npm install
```

### 2. Setup

```bash
npm run setup
```

This will ask for:
- Telegram Bot Token (from @BotFather)
- Anthropic API Key (from console.anthropic.com)
- Personality preference

### 3. Start

```bash
npm start
```

Message your Telegram bot to get started!

## Commands

| Command | Description |
|---------|-------------|
| `npm run setup` | Run interactive setup wizard |
| `npm start` | Start the bot |
| `npm run status` | Show bot status |
| `mikiclaw skills install <name>` | Install a skill |
| `mikiclaw skills list` | List installed skills |

## Configuration

Configuration is stored in `~/.mikiclaw/config.json`

```json
{
  "telegram": {
    "botToken": "your-token"
  },
  "anthropic": {
    "apiKey": "your-key",
    "model": "claude-sonnet-4-20250514"
  },
  "heartbeat": {
    "enabled": true,
    "intervalMinutes": 30
  }
}
```

## Personality (SOUL.md)

Define your assistant's personality by editing `~/.mikiclaw/workspace/SOUL.md`:

```markdown
# Identity
- Name: Miki
- Role: Your personal AI assistant
- Voice: Warm, curious, friendly but competent

# Principles
1. Be helpful without being overwhelming.
2. Ask clarifying questions when needed.
3. Keep responses concise and actionable.

# Boundaries
- Don't execute destructive commands without confirmation.
- Stop and ask if something seems unsafe.
```

## Heartbeat

Configure periodic tasks in `~/.mikiclaw/workspace/HEARTBEAT.md`:

```markdown
# Tasks
## daily_summary
- schedule: "0 9 * * *"
- action: summarize_conversations
```

## Skills

Install skills from ClawHub:

```bash
mikiclaw skills install tavily-web-search
mikiclaw skills list
```

## Security

- Credentials stored locally in `~/.mikiclaw/`
- No cloud dependency
- Destructive commands require confirmation
- Command allowlisting for safety

## Requirements

- Node.js 22+
- Telegram Bot (from @BotFather)
- Anthropic API Key (from console.anthropic.com)

## License

MIT
