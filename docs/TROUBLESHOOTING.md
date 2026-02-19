# 🐛 Troubleshooting Guide

Common issues and solutions for mikiclaw.

---

## 📋 Table of Contents

- [Bot Not Responding](#bot-not-responding)
- [Configuration Issues](#configuration-issues)
- [API Errors](#api-errors)
- [Tool/Command Errors](#toolcommand-errors)
- [Health Endpoint Issues](#health-endpoint-issues)
- [Performance Issues](#performance-issues)
- [Encryption Issues](#encryption-issues)
- [Logs and Debugging](#logs-and-debugging)

---

## 🤖 Bot Not Responding

### Symptoms
- Bot doesn't reply to messages
- Bot shows as offline in Telegram

### Solutions

#### 1. Check if Bot is Running

```bash
# If running directly
ps aux | grep mikiclaw

# If using systemd
sudo systemctl status mikiclaw

# If using PM2
pm2 status mikiclaw

# If using Docker
docker ps | grep mikiclaw
```

#### 2. Verify Telegram Token

```bash
# Check config
cat ~/.mikiclaw/config.json | jq '.telegram'

# Test token manually
curl "https://api.telegram.org/botYOUR_TOKEN/getMe"
```

If you get an error, your token is invalid. Get a new one from @BotFather.

#### 3. Check Logs

```bash
# View recent errors
tail -100 ~/.mikiclaw/logs/*.log | grep -i error

# Real-time logging
tail -f ~/.mikiclaw/logs/mikiclaw-$(date +%Y-%m-%d).log
```

#### 4. Check Rate Limiting

```bash
# View rate limit data
cat ~/.mikiclaw/rate_limits.json | jq

# Reset rate limits if needed
rm ~/.mikiclaw/rate_limits.json
```

#### 5. Restart the Bot

```bash
# Direct
Ctrl+C && npm start

# Systemd
sudo systemctl restart mikiclaw

# PM2
pm2 restart mikiclaw

# Docker
docker-compose restart mikiclaw
```

---

## ⚙️ Configuration Issues

### Symptoms
- "Not configured" errors
- Setup wizard fails
- Configuration not saved

### Solutions

#### 1. Check Config File Permissions

```bash
# Check permissions
ls -la ~/.mikiclaw/config.json

# Fix if needed
chmod 600 ~/.mikiclaw/config.json
chown $USER:$USER ~/.mikiclaw/config.json
```

#### 2. Validate JSON Syntax

```bash
# Using jq
cat ~/.mikiclaw/config.json | jq .

# Using Node.js
node -e "console.log(JSON.parse(require('fs').readFileSync('$HOME/.mikiclaw/config.json')))"
```

#### 3. Reset Configuration

```bash
# Backup existing config
cp ~/.mikiclaw/config.json ~/.mikiclaw/config.json.bak

# Remove and re-run setup
rm ~/.mikiclaw/config.json
npm run setup
```

#### 4. Check Encryption Key

```bash
# Verify key exists
ls -la ~/.mikiclaw_key

# Fix permissions
chmod 600 ~/.mikiclaw_key

# If key is corrupted, you'll need to re-enter credentials
```

---

## 🔌 API Errors

### Symptoms
- "API key not configured" errors
- "Rate limit exceeded" from AI provider
- "Invalid API key" errors

### Solutions

#### 1. Verify API Key Configuration

```bash
# Check if key is configured (will show encrypted value)
cat ~/.mikiclaw/config.json | jq '.ai'

# Test Anthropic key
curl -H "Authorization: Bearer sk-ant-xxx" \
  https://api.anthropic.com/v1/messages \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-3-sonnet-20240229","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}'
```

#### 2. Check API Credits/Quota

- **Anthropic**: https://console.anthropic.com/settings/limits
- **Kimi**: https://platform.moonshot.ai/
- **MiniMax**: https://platform.minimax.io/

#### 3. Handle Rate Limits

```bash
# Check current rate limit settings
cat ~/.mikiclaw/config.json | jq '.rateLimit'

# Temporarily disable rate limiting (not recommended for production)
# Edit config and set: "enabled": false

# Or increase limit
# Edit config and set: "maxRequestsPerMinute": 30
```

#### 4. Network Issues

```bash
# Test connectivity
curl -I https://api.anthropic.com

# Check DNS
nslookup api.anthropic.com

# Check firewall
sudo ufw status
```

---

## 🛠 Tool/Command Errors

### Symptoms
- "Command blocked" messages
- "Path traversal detected" errors
- Tools not executing

### Solutions

#### 1. Command Blocked

```bash
# Check current policy
cat ~/.mikiclaw/config.json | jq '.security.toolPolicy'

# View allowed commands
cat ~/.mikiclaw/config.json | jq '.security.allowedCommands'

# Add command to allowlist
# Edit ~/.mikiclaw/config.json and add to allowedCommands array
```

**Example**: Allow `npm install`:
```json
{
  "security": {
    "allowedCommands": [
      "git status",
      "npm install",
      "... other commands ..."
    ]
  }
}
```

#### 2. Path Traversal Errors

All file operations are scoped to the workspace directory:

```bash
# Check workspace path
cat ~/.mikiclaw/config.json | jq '.workspace.path'

# Files must be within workspace
ls -la ~/.mikiclaw/workspace/
```

To access files outside workspace, you need to:
1. Copy files to workspace, OR
2. Change workspace path in config

#### 3. Tool Not Found

```bash
# Check if tool exists
npm run skills:list

# Verify tool is in allowed commands
# Some tools like 'nodejs' are disabled for security
```

---

## 🏥 Health Endpoint Issues

### Symptoms
- Can't access health endpoint
- "Unauthorized" errors
- Connection refused

### Solutions

#### 1. Check if Health Server is Running

```bash
# Check if port is listening
netstat -tlnp | grep 18790
# or
lsof -i :18790

# Check process
ps aux | grep mikiclaw
```

#### 2. Authentication Required

```bash
# Get auth token (localhost only)
curl http://localhost:18790/token

# Use token for health check
TOKEN=$(curl -s http://localhost:18790/token | jq -r '.token')
curl -H "X-Auth-Token: $TOKEN" http://localhost:18790/health
```

#### 3. Remote Access

By default, health endpoint only accepts localhost connections. To allow remote:

```javascript
// Edit src/bot/health.ts or set via config
// Change bindAddress from "127.0.0.1" to "0.0.0.0"
```

⚠️ **Warning**: Only do this in secure networks with proper authentication.

#### 4. Firewall Rules

```bash
# Allow port (if needed)
sudo ufw allow 18790/tcp

# Check firewall status
sudo ufw status
```

---

## ⚡ Performance Issues

### Symptoms
- Slow responses
- High memory usage
- Bot becomes unresponsive

### Solutions

#### 1. Check Resource Usage

```bash
# Memory usage
ps aux | grep mikiclaw

# System resources
top -p $(pgrep -f mikiclaw)

# Docker resources
docker stats mikiclaw
```

#### 2. Clear Conversation History

```bash
# View conversation files
ls -la ~/.mikiclaw/workspace/conversations/

# Clear old conversations (backup first!)
tar -czf conversations-backup.tar.gz ~/.mikiclaw/workspace/conversations/
rm ~/.mikiclaw/workspace/conversations/*.json
```

#### 3. Clear Memory

```bash
# Backup and clear memory
cp ~/.mikiclaw/workspace/MEMORY.md ~/.mikiclaw/workspace/MEMORY.md.bak
echo "# Memory\n\nCleared on $(date)" > ~/.mikiclaw/workspace/MEMORY.md
```

#### 4. Adjust Rate Limits

Lower rate limits reduce load:

```json
{
  "rateLimit": {
    "enabled": true,
    "maxRequestsPerMinute": 10
  }
}
```

#### 5. Restart Service

```bash
# Clear memory and restart
sudo systemctl restart mikiclaw
# or
pm2 restart mikiclaw
```

---

## 🔐 Encryption Issues

### Symptoms
- "Failed to decrypt" errors
- "Invalid encrypted format" errors
- Can't read credentials after restart

### Solutions

#### 1. Check Key File

```bash
# Verify key exists
ls -la ~/.mikiclaw_key

# Check permissions (should be 600)
stat -c "%a" ~/.mikiclaw_key

# Fix permissions
chmod 600 ~/.mikiclaw_key
```

#### 2. Key File Corruption

If the key file is corrupted:

```bash
# Backup config
cp ~/.mikiclaw/config.json ~/.mikiclaw/config.json.bak

# Remove corrupted key
rm ~/.mikiclaw_key

# Re-enter credentials
npm run setup
```

#### 3. Migrate to New Machine

```bash
# On old machine, backup key
cp ~/.mikiclaw_key mikiclaw_key.backup

# On new machine, restore key
cp mikiclaw_key.backup ~/.mikiclaw_key
chmod 600 ~/.mikiclaw_key

# Also copy config
cp config.json ~/.mikiclaw/config.json
```

---

## 📊 Logs and Debugging

### Log Locations

| Log Type | Location |
|----------|----------|
| Application | `~/.mikiclaw/logs/mikiclaw-YYYY-MM-DD.log` |
| Systemd | `journalctl -u mikiclaw` |
| PM2 | `~/.pm2/logs/` |
| Docker | `docker logs mikiclaw` |

### Enable Debug Logging

```javascript
// Edit config or set environment
{
  "logging": {
    "level": "debug"
  }
}
```

### Common Log Messages

| Message | Meaning | Solution |
|---------|---------|----------|
| `Rate limit exceeded` | Too many requests | Wait or increase limit |
| `Blocked command` | Command not in allowlist | Add to allowedCommands |
| `Path traversal detected` | Attempted access outside workspace | Use relative paths |
| `Invalid encrypted format` | Credential decryption failed | Check key file |
| `API Error` | AI provider error | Check API key and quota |

### Debug Commands

```bash
# Show all errors today
grep "ERROR" ~/.mikiclaw/logs/mikiclaw-$(date +%Y-%m-%d).log

# Show blocked commands
grep "Blocked" ~/.mikiclaw/logs/*.log

# Show API calls
grep "API" ~/.mikiclaw/logs/*.log

# Export security events
grep -E "blocked|rejected|denied|error" ~/.mikiclaw/logs/*.log > debug.log
```

### Get Help

If you can't resolve the issue:

1. **Collect Information**:
   ```bash
   # System info
   node --version
   npm --version
   uname -a
   
   # Config (remove sensitive data!)
   cat ~/.mikiclaw/config.json | jq 'del(.telegram, .ai)'
   
   # Recent logs
   tail -200 ~/.mikiclaw/logs/*.log
   ```

2. **Create GitHub Issue**:
   - Include error messages
   - Include steps to reproduce
   - Include collected information

---

## 📞 Still Having Issues?

1. Check the [README](../README.md) for setup instructions
2. Review [SECURITY.md](../SECURITY.md) for security configuration
3. Search existing [GitHub Issues](https://github.com/Softorize/mikiclaw/issues)
4. Create a new issue with detailed information

---

**Last Updated**: February 2026
