# 🦞 mikiclaw

Your personal AI assistant with Telegram interface, ClawHub skills, and SOUL.md personality.

Inspired by [OpenClaw](https://openclaw.ai) and built with the same philosophy - a self-hosted AI agent that you control.

## Features

### Core
- **🤖 Telegram Bot** - Chat with your AI assistant on Telegram
- **🧠 Claude AI** - Powered by Anthropic's Claude API
- **📦 ClawHub Skills** - Extend capabilities with skills from ClawHub
- **💫 SOUL.md Personality** - Define your assistant's personality
- **❤️ Heartbeat** - Scheduled tasks and check-ins
- **🔒 Self-Hosted** - Your data stays on your machine

### Security
- **Credential Encryption** - API keys encrypted with AES-256-GCM
- **Tool Policy Engine** - Block destructive commands, allowlist mode
- **Rate Limiting** - 20 requests/minute per user

### Tools
- **bash** - Execute shell commands
- **read_file** - Read files from filesystem
- **write_file** - Write files to filesystem
- **list_directory** - List directory contents
- **glob** - Find files by pattern
- **grep** - Search in files
- **search** - Web search
- **git** - Git version control
- **get_system_info** - System information
- **nodejs** - Execute JavaScript

### Monitoring
- **Health Endpoint** - http://localhost:18790/health
- **Metrics** - http://localhost:18790/metrics
- **Logging** - Daily rotating logs in ~/.mikiclaw/logs/

## Quick Start

### 1. Install

```bash
git clone https://github.com/Softorize/mikiclaw
cd mikiclaw
npm install
npm run build
```

### 2. Setup

```bash
npm run setup
```

This will ask for:
- Telegram Bot Token (from @BotFather)
- Anthropic API Key (from console.anthropic.com)
- Personality preference
- Tool policy
- Encryption preference
- Rate limiting preference

### 3. Start

```bash
npm start
```

Message your Telegram bot to get started!

## Commands

### Bot Commands
| Command | Description |
|---------|-------------|
| `/start` | Start the bot |
| `/help` | Show help |
| `/status` | Check system status |
| `/health` | Health check |
| `/skills` | List installed skills |

### CLI Commands
| Command | Description |
|---------|-------------|
| `npm run setup` | Run interactive setup wizard |
| `npm start` | Start the bot |
| `npm run status` | Show bot status |

## Configuration

Configuration is stored in `~/.mikiclaw/config.json`

```json
{
  "telegram": {
    "botToken": "encrypted:..."
  },
  "anthropic": {
    "apiKey": "encrypted:...",
    "model": "claude-sonnet-4-20250514"
  },
  "heartbeat": {
    "enabled": true,
    "intervalMinutes": 30
  },
  "security": {
    "encryptCredentials": true,
    "toolPolicy": "block-destructive",
    "blockedCommands": ["rm -rf /", "dd if=", ...]
  },
  "rateLimit": {
    "enabled": true,
    "maxRequestsPerMinute": 20
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

## Memory System

Miki learns from your conversations! Memory is stored in `~/.mikiclaw/workspace/MEMORY.md`

- Facts about you are automatically remembered
- Preferences are tracked
- Important context is preserved across sessions

## Heartbeat

Configure periodic tasks in `~/.mikiclaw/workspace/HEARTBEAT.md`:

```markdown
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

## Health Check

```bash
curl http://localhost:18790/health
curl http://localhost:18790/metrics
```

## Logs

Logs are stored in `~/.mikiclaw/logs/` with daily rotation.

## Requirements

- Node.js 22+
- Telegram Bot (from @BotFather)
- Anthropic API Key (from console.anthropic.com)

## Security

- Credentials stored locally in `~/.mikiclaw/`
- Optional encryption for API keys
- No cloud dependency
- Destructive commands require confirmation
- Command allowlisting/blocklisting

## License

MIT
