# 🦞 mikiclaw

**Your personal AI assistant with Telegram interface, multi-model support, ClawHub skills, and SOUL.md personality.**

Inspired by [OpenClaw](https://openclaw.ai) and built with the same philosophy - a self-hosted AI agent that you control.

![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 22+** (required)
- **Telegram account** (for bot interface)
- **API Key** for one of:
  - [Anthropic Claude](https://console.anthropic.com/) (recommended)
  - [Kimi (Moonshot)](https://platform.moonshot.ai/)
  - [MiniMax](https://platform.minimax.io/)

### 1. Install

```bash
# Clone the repository
git clone https://github.com/Softorize/mikiclaw
cd mikiclaw

# Install dependencies
npm install

# Build the project
npm run build
```

### 2. Setup (Interactive Wizard)

```bash
npm run setup
```

The setup wizard will guide you through:

1. **AI Provider Selection** - Choose your preferred AI model
2. **Telegram Bot Token** - Get from [@BotFather](https://t.me/BotFather)
3. **API Key** - Enter your chosen provider's API key
4. **Personality** - Select your assistant's personality
5. **Security Settings** - Configure tool policies (allowlist recommended)
6. **Encryption** - Enable credential encryption (highly recommended)
7. **Rate Limiting** - Protect against abuse

### 3. Start

```bash
npm start
```

Message your Telegram bot to get started!

---

## 📋 Table of Contents

- [Features](#-features)
- [Quick Start](#-quick-start)
- [Documentation](#-documentation)
- [Configuration](#-configuration)
- [Security](#-security)
- [Commands](#-commands)
- [Personality (SOUL.md)](#-personality-soulmd)
- [Skills System](#-skills-system)
- [Deployment Options](#-deployment-options)
- [Troubleshooting](#-troubleshooting)
- [Development](#-development)
- [Contributing](#-contributing)

---

## 📚 Documentation

- [Architecture Guide](docs/ARCHITECTURE.md) - components, request lifecycle, and extension points
- [Automation Workflows](docs/AUTOMATION_WORKFLOWS.md) - webhook/heartbeat triggers, conditions, actions, and signed request examples
- [Operations & Observability](docs/OPERATIONS_AND_OBSERVABILITY.md) - health, metrics, logging, approvals, and runbooks
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Troubleshooting Guide](docs/TROUBLESHOOTING.md)
- [Memory & Learning](docs/MEMORY_AND_LEARNING.md)

---

## ✨ Features

### Core Capabilities

| Feature | Description |
|---------|-------------|
| **🤖 Multi-Channel** | Telegram, Discord, Slack, WebChat |
| **🧠 Multi-Model AI** | Anthropic, OpenAI, Kimi, MiniMax, and local providers |
| **🛟 Router + Failover** | Strategy-based routing with automatic provider fallback |
| **🕸️ Gateway** | WebSocket control plane for all channels |
| **📦 ClawHub Skills** | Extend capabilities with community skills |
| **💫 SOUL.md Personality** | Define your assistant's personality |
| **❤️ Heartbeat** | Scheduled tasks and check-ins |
| **⚙️ Workflows** | Trigger -> condition -> action automation engine |
| **✅ Approval Gate** | Risky actions require explicit in-chat approval |
| **📈 Observability** | Runtime metrics, provider/tool stats, and health endpoints |
| **🔒 Self-Hosted** | Your data stays on your machine |
| **🌐 Web Interface** | Built-in web chat UI |
| **🤖 Browser Automation** | Headless browser control |
| **💬 Session Management** | Multi-session support with history |

### AI Providers

| Provider | Models | Status |
|----------|--------|--------|
| **Anthropic** | claude-sonnet-4, claude-3.5-sonnet, claude-3-opus | ✅ Recommended |
| **OpenAI** | gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-4, gpt-3.5-turbo | ✅ Supported |
| **Kimi** | kimi-k2.5, kimi-k2-thinking | ✅ Supported |
| **MiniMax** | M2.5, M2.5-highspeed, M2.1 | ✅ Supported |
| **Local** | OpenAI-compatible local endpoint | ✅ Supported |

### Built-in Tools

| Tool | Description | Security |
|------|-------------|----------|
| `bash` | Execute shell commands | ✅ Allowlist/Blocklist |
| `applescript` | Control macOS via AppleScript | ✅ Permission-gated (`/grant_access`) |
| `read_file` | Read files from filesystem | ✅ Path validation |
| `write_file` | Write files to filesystem | ✅ Path validation |
| `list_directory` | List directory contents | ✅ Scoped to workspace |
| `glob` | Find files by pattern | ✅ Pattern validation |
| `grep` | Search in files | ✅ Pattern validation |
| `search` | Web search (DuckDuckGo) | ✅ SSRF protection |
| `git` | Git version control | ✅ Command validation |
| `get_system_info` | System information | ✅ Safe |
| `browser_*` | Browser automation | ✅ Session-scoped |
| `gac_*` | Google Analytics account/property listing | ✅ Requires local access grant |

### Browser Automation

Control a headless browser to interact with websites:

- `browser_navigate` - Open a webpage
- `browser_screenshot` - Capture current page
- `browser_click` - Click elements
- `browser_type` - Type in input fields
- `browser_content` - Get page text
- `browser_evaluate` - Run JavaScript
- `browser_fill` - Fill form fields
- `browser_select` - Select dropdown options
- `browser_scroll` - Scroll page
- `browser_back/forward` - Navigation
- `browser_snapshot` - Structured page snapshot

### Chat Commands

Use these commands in Telegram (default channel adapter):

| Command | Description |
|---------|-------------|
| `/status` | Show session and system status |
| `/help` | Show available commands |
| `/health` | Show health server summary |
| `/session` | Show current session details |
| `/metrics` | Show runtime metrics snapshot |
| `/joke` | Send a random joke |
| `/fact` | Send a random fun fact |
| `/grant_access` | Grant AppleScript machine control |
| `/revoke_access` | Revoke AppleScript machine control |
| `/access_status` | Show machine-control permission |
| `/approvals` | List pending risky tool actions |
| `/approve [id]` | Approve latest/specific risky action |
| `/deny [id]` | Deny latest/specific risky action |

---

## 🔧 Configuration

### Configuration Files

| File | Location | Purpose |
|------|----------|---------|
| `config.json` | `~/.mikiclaw/config.json` | Main configuration |
| `SOUL.md` | `~/.mikiclaw/workspace/SOUL.md` | Personality definition |
| `MEMORY.md` | `~/.mikiclaw/workspace/Memory.md` | Long-term memory |
| `HEARTBEAT.md` | `~/.mikiclaw/workspace/HEARTBEAT.md` | Scheduled tasks |
| `rate_limits.json` | `~/.mikiclaw/rate_limits.json` | Rate limit data |
| `.mikiclaw_key` | `~/.mikiclaw_key` | Encryption master key |

### Configuration Schema

```json5
{
  "telegram": {
    "botToken": "encrypted:...",  // Your Telegram bot token
    "allowedUsers": []            // Limit to specific users (optional)
  },
  "discord": {
    "botToken": "...",            // Discord bot token
    "allowedGuilds": [],          // Limit to specific guilds (optional)
    "allowedChannels": []         // Limit to specific channels (optional)
  },
  "slack": {
    "appToken": "...",            // Slack app-level token
    "botToken": "...",            // Slack bot token
    "signingSecret": "...",       // Slack signing secret
    "allowedChannels": []         // Limit to specific channels (optional)
  },
  "webchat": {
    "enabled": true,              // Enable web interface
    "port": 18791,                // WebChat port
    "bindAddress": "127.0.0.1"    // Bind address
  },
  "ai": {
    "provider": "anthropic",      // anthropic | openai | kimi | minimax | local
    "model": "claude-sonnet-4-20250514",
    "routing": {
      "enabled": true,            // Enable provider routing + failover
      "strategy": "balanced",     // quality-first | speed-first | cost-first | balanced
      "fallbackProviders": ["openai", "kimi", "minimax", "local"]
    },
    "providers": {
      "anthropic": { "apiKey": "encrypted:..." },
      "openai": { "apiKey": "encrypted:..." },
      "kimi": { "apiKey": "encrypted:..." },
      "minimax": { "apiKey": "encrypted:...", "groupId": "..." },
      "local": {
        "baseUrl": "http://localhost:8000/v1",
        "apiKey": "not-needed"
      }
    }
  },
  "webhooks": {
    "enabled": false,
    "port": 19091,
    "secret": "replace-me",
    "maxPayloadBytes": 1048576,
    "rateLimitPerMinute": 60,
    "endpoints": [
      {
        "path": "/incoming/build-fail",
        "url": "https://example.com/webhooks/build-fail",
        "method": "POST",
        "events": ["*"],
        "secret": "replace-me"
      }
    ]
  },
  "automation": {
    "enabled": false,
    "workflows": [
      {
        "id": "build-failure-alert",
        "enabled": true,
        "trigger": { "type": "webhook", "path": "/incoming/build-fail" },
        "condition": { "field": "data.status", "equals": "failed" },
        "action": {
          "type": "emit_webhook_event",
          "eventType": "alerts.build.failed",
          "message": "Build failed for {{data.project}} on {{data.branch}}"
        }
      }
    ]
  },
  "heartbeat": {
    "enabled": true,              // Enable periodic check-ins
    "intervalMinutes": 30
  },
  "memory": {
    "perUserEntryCap": 500,       // Max entries per user in long-term memory
    "maxConnectedContextEntries": 8,
    "semanticMinSimilarity": 0.75
  },
  "channels": {
    "default": "telegram",
    "enabled": ["telegram"]
  },
  "security": {
    "encryptCredentials": true,   // Encrypt API keys
    "toolPolicy": "allowlist-only", // allowlist-only | block-destructive | allow-all
    "allowedCommands": ["git status", "ls", "cat", "echo"],
    "blockedCommands": ["rm -rf /", "dd if=", "mkfs"]
  },
  "rateLimit": {
    "enabled": true,              // Enable rate limiting
    "maxRequestsPerMinute": 20
  }
}
```

### Environment Variables (Optional)

```bash
# Copy .env.example to .env
cp .env.example .env
```

| Variable | Description | Default |
|----------|-------------|---------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | - |
| `ANTHROPIC_API_KEY` | Anthropic API key | - |
| `ANTHROPIC_MODEL` | Model to use | `claude-sonnet-4-20250514` |
| `HEARTBEAT_ENABLED` | Enable heartbeat | `true` |
| `HEARTBEAT_INTERVAL_MINUTES` | Heartbeat interval | `30` |

---

## 🔐 Security

### Security Features

| Feature | Description |
|---------|-------------|
| **Credential Encryption** | API keys encrypted with AES-256-GCM |
| **Tool Policy Engine** | Allowlist-only by default |
| **Path Traversal Protection** | All file paths validated and scoped |
| **Command Injection Prevention** | Input validation on all commands |
| **Rate Limiting** | Persistent rate limiting per user |
| **Risky Action Approval** | `bash`/`write_file`/`applescript`/risky browser actions need explicit approval |
| **Health Endpoint Auth** | Token-based authentication required |
| **Obfuscation Detection** | Detects base64, eval, reverse shells |

### Security Best Practices

1. **Always use allowlist-only policy** for production
2. **Enable credential encryption** (default)
3. **Restrict allowed users** in config if possible
4. **Keep the master key file secure**: `~/.mikiclaw_key`
5. **Review allowed commands** regularly
6. **Monitor logs** in `~/.mikiclaw/logs/`

### Security Configuration

```json
{
  "security": {
    // MOST SECURE: Only explicitly allowed commands
    "toolPolicy": "allowlist-only",
    "allowedCommands": [
      "git status", "git log", "git diff",
      "ls", "cat", "head", "tail",
      "grep", "find", "pwd", "echo",
      "npm run", "tsc"
    ],
    
    // Defense in depth: always block these
    "blockedCommands": [
      "rm -rf /", "dd if=", "mkfs", "fdisk",
      "curl | sh", "wget | sh",
      "base64 -d", "eval $(",
      "/dev/tcp/", "nc -e", "bash -i"
    ],
    
    // Encrypt all credentials
    "encryptCredentials": true
  }
}
```

> 📖 See [SECURITY.md](SECURITY.md) for detailed security documentation.

---

## 📟 Commands

### Bot Commands (Telegram)

| Command | Description |
|---------|-------------|
| `/start` | Start the bot and see welcome message |
| `/help` | Show available commands and help |
| `/status` | Check system status and configuration |
| `/health` | Health check with detailed status |
| `/metrics` | Runtime metrics summary (requests, failures, estimated tokens/cost) |
| `/session` | Show current session metadata |
| `/joke` | Send a random joke |
| `/fact` | Send a random fun fact |
| `/grant_access` | Allow AppleScript machine control in this chat |
| `/revoke_access` | Revoke AppleScript machine control |
| `/access_status` | Check AppleScript access status |
| `/approvals` | List pending risky tool approvals |
| `/approve [id]` | Approve latest or specific risky action |
| `/deny [id]` | Deny latest or specific risky action |

### CLI Commands

| Command | Description |
|---------|-------------|
| `npm run setup` | Run interactive setup wizard |
| `npm start` | Start the bot |
| `npm run status` | Show system status |
| `npm run build` | Build TypeScript to JavaScript |
| `npm run dev` | Run in development mode |
| `npm test` | Run test suite |

---

## 💫 Personality (SOUL.md)

Define your assistant's personality by editing `~/.mikiclaw/workspace/SOUL.md`:

```markdown
# Identity
- Name: Miki
- Role: Your personal AI assistant
- Voice: Warm, curious, friendly but competent

# Principles
1. Be helpful without being overwhelming.
2. Ask clarifying questions when needed.
3. Admit what you don't know.
4. Keep responses concise and actionable.

# Boundaries
- Don't execute destructive commands without confirmation.
- Don't share private system details.
- Stop and ask if something seems unsafe.

# Interaction Style
- Use light formatting (bold for emphasis)
- Use emojis sparingly (1-2 per message)
- Format code in code blocks
- End with a question or offer
```

### Built-in Personality Templates

During setup, choose from:

| Template | Description |
|----------|-------------|
| **Miki** (default) | Friendly and helpful |
| **Professional** | Concise and business-focused |
| **Mentor** | Educational and patient |
| **Power User** | Technical and efficient |

---

## 📦 Skills System

Extend mikiclaw with skills from ClawHub.

### Managing Skills

```bash
# List installed skills
node dist/index.js skills list

# Install a skill
node dist/index.js skills install <skill-name>

# Show config location
node dist/index.js config
```

### Creating Custom Skills

Create a skill manifest at `~/.mikiclaw/skills/<name>/claw.json`:

```json
{
  "name": "my-custom-skill",
  "version": "1.0.0",
  "description": "My custom skill description",
  "author": "Your Name",
  "tools": [
    {
      "name": "my_tool",
      "description": "What this tool does",
      "command": "echo",
      "inputSchema": {
        "type": "object",
        "properties": {
          "input": { "type": "string" }
        }
      }
    }
  ]
}
```

---

## 🚀 Deployment Options

### Quick Recommendation

| Platform | Recommended Service Manager |
|----------|-----------------------------|
| Linux | `systemd` |
| macOS | `launchd` (`LaunchAgent`) |
| Windows | `NSSM` (Windows Service) |
| Any | `PM2` |

### Option 1: Local (foreground)

Use this for development only:

```bash
npm install
npm run build
npm run setup
npm start
```

### Option 2: Run As OS Service (recommended)

Build once before configuring any service:

```bash
npm install
npm run build
npm run setup
```

#### Linux (`systemd`)

Create `/etc/systemd/system/mikiclaw.service`:

```ini
[Unit]
Description=mikiclaw AI assistant service
After=network.target

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/ABSOLUTE/PATH/TO/mikiclaw
ExecStart=/usr/bin/env node /ABSOLUTE/PATH/TO/mikiclaw/dist/index.js start
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
# Enable + start
sudo systemctl daemon-reload
sudo systemctl enable mikiclaw
sudo systemctl start mikiclaw

# Verify + logs
sudo systemctl status mikiclaw
sudo journalctl -u mikiclaw -f
```

#### macOS (`launchd`)

Create `~/Library/LaunchAgents/com.softorize.mikiclaw.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.softorize.mikiclaw</string>

    <key>ProgramArguments</key>
    <array>
      <string>/usr/bin/env</string>
      <string>node</string>
      <string>/ABSOLUTE/PATH/TO/mikiclaw/dist/index.js</string>
      <string>start</string>
    </array>

    <key>WorkingDirectory</key>
    <string>/ABSOLUTE/PATH/TO/mikiclaw</string>

    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/ABSOLUTE/PATH/TO/mikiclaw/logs/launchd-out.log</string>
    <key>StandardErrorPath</key>
    <string>/ABSOLUTE/PATH/TO/mikiclaw/logs/launchd-err.log</string>
  </dict>
</plist>
```

```bash
mkdir -p ./logs

# Load + start
launchctl load -w ~/Library/LaunchAgents/com.softorize.mikiclaw.plist
launchctl start com.softorize.mikiclaw

# Status + logs
launchctl list | grep mikiclaw
tail -f ./logs/launchd-out.log
```

#### Windows (NSSM service)

Install [NSSM](https://nssm.cc/download), then in elevated PowerShell:

```bash
npm install
npm run build
npm run setup

nssm install MikiClaw "C:\Program Files\nodejs\node.exe" "C:\ABSOLUTE\PATH\mikiclaw\dist\index.js" start
nssm set MikiClaw AppDirectory "C:\ABSOLUTE\PATH\mikiclaw"
nssm set MikiClaw AppStdout "C:\ABSOLUTE\PATH\mikiclaw\logs\service-out.log"
nssm set MikiClaw AppStderr "C:\ABSOLUTE\PATH\mikiclaw\logs\service-err.log"
nssm start MikiClaw
```

### Option 3: PM2 (cross-platform)

```bash
npm install -g pm2
pm2 start dist/index.js --name "mikiclaw" -- start
pm2 save
pm2 startup
pm2 status
pm2 logs mikiclaw
```

### Option 4: Docker

```bash
docker build -t mikiclaw .
docker run -d \
  --name mikiclaw \
  -v mikiclaw-data:/home/nodejs/.mikiclaw \
  mikiclaw
```

### Option 5: Cloud

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for Railway/Render/GCP/AWS examples.

### Updating A Running Service

After pulling new code:

```bash
git pull
npm install
npm run build
```

Then restart based on service manager:

```bash
# systemd
sudo systemctl restart mikiclaw

# launchd
launchctl kickstart -k gui/$(id -u)/com.softorize.mikiclaw

# PM2
pm2 restart mikiclaw
```

---

## 🔍 Monitoring

### Health Endpoints

| Endpoint | URL | Auth Required |
|----------|-----|---------------|
| Health | `http://localhost:19090/health` | ✅ Token |
| Metrics | `http://localhost:19090/metrics` | ✅ Token |
| Token | `http://localhost:19090/token` | Localhost only |

```bash
# Check health (with auth token)
curl -H "X-Auth-Token: YOUR_TOKEN" http://localhost:19090/health

# Get auth token (localhost only)
curl http://localhost:19090/token
```

### Logs

Logs are stored in `~/.mikiclaw/logs/` with daily rotation.

```bash
# View today's log
tail -f ~/.mikiclaw/logs/mikiclaw-$(date +%Y-%m-%d).log

# Search logs
grep "ERROR" ~/.mikiclaw/logs/*.log
```

---

## 🐛 Troubleshooting

### Common Issues

#### Bot doesn't respond

1. Check if bot is running: `npm run status`
2. Verify Telegram token is correct
3. Check logs: `~/.mikiclaw/logs/`
4. Ensure bot is not rate limited

#### "Command blocked" errors

1. Review your tool policy in config
2. Add command to `allowedCommands` list
3. Consider switching to `block-destructive` policy temporarily

#### API errors

1. Verify API key is correct and has credits
2. Check network connectivity
3. Review rate limits on your API plan
4. Check logs for detailed error messages

#### Encryption key issues

```bash
# Check key file permissions
ls -la ~/.mikiclaw_key

# Fix permissions if needed
chmod 600 ~/.mikiclaw_key
```

#### Health endpoint not accessible

1. By default, only localhost can access without auth
2. Get auth token: `curl http://localhost:19090/token`
3. Use token in header: `curl -H "X-Auth-Token: TOKEN" http://localhost:19090/health`

### Getting Help

1. Check logs: `~/.mikiclaw/logs/`
2. Run status: `npm run status`
3. Review configuration: `cat ~/.mikiclaw/config.json`
4. Open an issue on GitHub

---

## 🛠 Development

### Project Structure

```
mikiclaw/
├── src/
│   ├── agent/          # Agent logic and tools
│   ├── ai/             # AI providers + router/failover
│   ├── automation/     # Workflow engine (trigger/condition/action)
│   ├── bot/            # Telegram bot handlers
│   ├── channels/       # Channel adapters
│   ├── commands/       # CLI commands
│   ├── config/         # Configuration and encryption
│   ├── heartbeat/      # Scheduled tasks
│   ├── observability/  # Runtime metrics store
│   ├── personality/    # SOUL.md and memory
│   ├── security/       # Access grants + risky action approvals
│   ├── skills/         # Skills system
│   ├── utils/          # Utilities (validation, retry, logging)
│   ├── webhooks/       # Signed webhook server + event delivery
│   └── index.ts        # Entry point
├── tests/              # Test suite
├── dist/               # Compiled JavaScript
└── workspace/          # Runtime workspace
```

### Development Commands

```bash
# Run in development mode (with hot reload)
npm run dev

# Build TypeScript
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npx vitest tests/validation.test.ts

# Run with coverage
npm run test:coverage
```

---

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Quick Start for Contributors

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/mikiclaw
cd mikiclaw

# Install dependencies
npm install

# Create a branch
git checkout -b feature/your-feature

# Make changes and test
npm run dev
npm test

# Commit and push
git commit -m "feat: add your feature"
git push origin feature/your-feature
```

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- Inspired by [OpenClaw](https://openclaw.ai)
- Built with [Telegraf](https://telegraf.js.org/) for Telegram
- AI integration via [@anthropic-ai/sdk](https://www.npmjs.com/package/@anthropic-ai-sdk)

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/Softorize/mikiclaw/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Softorize/mikiclaw/discussions)
- **Documentation**: This README and inline code comments

---

**Made with ❤️ by Softorize**
