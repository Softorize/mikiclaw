#!/bin/bash

# Script to switch mikiclaw to use local LLM

CONFIG_FILE="$HOME/.mikiclaw/config.json"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "Config file not found at $CONFIG_FILE"
    exit 1
fi

# Create backup
cp "$CONFIG_FILE" "$CONFIG_FILE.backup.$(date +%s)"

# Update config to use local provider
cat > "$CONFIG_FILE" << 'JSON'
{
  "telegram": {
    "botToken": "1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
  },
  "webchat": {
    "enabled": true,
    "port": 18791,
    "bindAddress": "127.0.0.1"
  },
  "ai": {
    "provider": "local",
    "model": "local-model",
    "providers": {
      "local": {
        "baseUrl": "http://192.168.1.124:8888/v1",
        "apiKey": "not-needed"
      }
    }
  },
  "security": {
    "encryptCredentials": false,
    "toolPolicy": "allowlist-only",
    "allowedCommands": ["git status", "git log", "git diff", "ls", "cat", "head", "tail", "grep", "find", "pwd", "echo", "node -e", "npm run", "tsc"],
    "blockedCommands": ["rm -rf /", "dd if=", ":(){:|:&};:", "curl | sh", "wget | sh", "mkfs", "fdisk", "dd", "> /dev/sda", "chmod -R 777", "chown -R root", "sudo rm", "pkill -9", "kill -9 1"]
  },
  "rateLimit": {
    "enabled": true,
    "maxRequestsPerMinute": 20
  },
  "heartbeat": {
    "enabled": true,
    "intervalMinutes": 30
  },
  "workspace": {
    "path": "'$HOME'/.mikiclaw/workspace"
  }
}
JSON

echo "✅ Config updated to use local LLM at http://192.168.1.124:8888/v1"
echo "📁 Backup saved to: $CONFIG_FILE.backup.*"
echo ""
echo "To start using local LLM:"
echo "  npm start"
