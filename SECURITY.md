# 🔐 Security Documentation

This document provides comprehensive security information for mikiclaw deployment and usage.

---

## 📋 Table of Contents

- [Security Overview](#security-overview)
- [Threat Model](#threat-model)
- [Security Features](#security-features)
- [Configuration Guide](#configuration-guide)
- [Deployment Security](#deployment-security)
- [Incident Response](#incident-response)
- [Security Checklist](#security-checklist)

---

## 🛡 Security Overview

mikiclaw is designed with **defense in depth** principles. Multiple security layers protect your system even if one layer is compromised.

### Security Principles

1. **Least Privilege** - Default to most restrictive settings
2. **Defense in Depth** - Multiple overlapping security controls
3. **Secure by Default** - Safe configurations out of the box
4. **Transparency** - All security decisions are logged
5. **User Control** - You control your data and keys

---

## ⚠️ Threat Model

### Protected Against

| Threat | Protection | Status |
|--------|------------|--------|
| **API Key Theft** | AES-256-GCM encryption with secure key file | ✅ Protected |
| **Command Injection** | Allowlist-only policy, input validation | ✅ Protected |
| **Path Traversal** | Path sanitization, workspace scoping | ✅ Protected |
| **Arbitrary Code Execution** | eval() disabled, sandboxed execution | ✅ Protected |
| **SSRF Attacks** | URL validation, private IP blocking | ✅ Protected |
| **Rate Limit Bypass** | Persistent file-based rate limiting | ✅ Protected |
| **Memory Corruption** | Input size limits, pattern validation | ✅ Protected |
| **Obfuscation Attacks** | Base64/eval/reverse shell detection | ✅ Protected |

### Not Protected Against

| Threat | Mitigation |
|--------|------------|
| **Physical Access** | Use full disk encryption |
| **Root Compromise** | Run as non-root user |
| **Social Engineering** | User education required |
| **Supply Chain Attacks** | Review dependencies regularly |

---

## 🔒 Security Features

### 1. Credential Encryption

**Algorithm**: AES-256-GCM  
**Key Derivation**: PBKDF2 with random salt  
**Key Storage**: `~/.mikiclaw_key` (mode 600)

```typescript
// Encryption format: salt:iv:tag:ciphertext
// Each component is hex-encoded
```

**Key File Security**:
- Generated on first use
- Permissions set to 600 (owner read/write only)
- Never committed to version control
- Back up securely if needed

### 2. Tool Policy Engine

Three policy levels (most to least secure):

#### Allowlist-Only (DEFAULT - Recommended)

```json
{
  "security": {
    "toolPolicy": "allowlist-only",
    "allowedCommands": [
      "git status", "git log", "git diff",
      "ls", "cat", "head", "tail",
      "grep", "find", "pwd", "echo",
      "npm run", "tsc"
    ]
  }
}
```

Only explicitly allowed commands can execute.

#### Block-Destructive

```json
{
  "security": {
    "toolPolicy": "block-destructive",
    "blockedCommands": [
      "rm -rf /", "dd if=", "mkfs", "fdisk",
      "curl | sh", "wget | sh"
    ]
  }
}
```

All commands allowed except explicitly blocked ones.

#### Allow-All (NOT Recommended)

```json
{
  "security": {
    "toolPolicy": "allow-all"
  }
}
```

⚠️ **Warning**: Only use in isolated test environments.

### 3. Input Validation

All user inputs are validated before use:

| Input Type | Validation |
|------------|------------|
| **File Paths** | Null byte rejection, traversal detection, sensitive path blocking |
| **Commands** | Pattern matching, allowlist verification, obfuscation detection |
| **Search Patterns** | Length limits, complexity checks, ReDoS prevention |
| **URLs** | Protocol validation, SSRF protection, private IP blocking |

### 4. Path Traversal Protection

```typescript
// All paths are:
// 1. Normalized to resolve . and ..
// 2. Checked against workspace boundary
// 3. Validated against sensitive path patterns
// 4. Verified for null bytes and special characters

const sensitivePatterns = [
  /(?:^|\/)proc\//i,
  /(?:^|\/)sys\//i,
  /(?:^|\/)etc\/(shadow|passwd|sudoers)/i,
  /(?:^|\/)dev\//i,
  /(?:^|\/)\.ssh\//i,
  /(?:^|\/)\.gnupg\//i,
  /(?:^|\/)\.aws\//i,
  /(?:^|\/)\.kube\//i,
];
```

### 5. Command Injection Prevention

Detected and blocked patterns:

```javascript
const dangerousPatterns = [
  /\$\(/,         // Command substitution $()
  /`[^`]*`/,      // Command substitution backticks
  /;\s*rm\s/,     // Semicolon followed by rm
  /\|\s*rm\s/,    // Pipe followed by rm
  /&&\s*rm\s/,    // AND followed by rm
  /;\s*curl\s/,   // Semicolon followed by curl
  /;\s*wget\s/,   // Semicolon followed by wget
  />\s*\/dev\//,  // Redirect to /dev
  /<\s*\/dev\//,  // Redirect from /dev
];
```

### 6. Obfuscation Detection

Automatically blocked:

- Base64 encoded commands
- Eval with command substitution
- Reverse shell patterns (`/dev/tcp/`, `nc -e`, `bash -i`)
- URL-based code execution (`$(curl`, `$(wget`)

### 7. Rate Limiting

- **Default**: 20 requests/minute per user
- **Persistence**: File-based storage survives restarts
- **Cleanup**: Automatic removal of stale entries

### 8. Health Endpoint Security

- **Default Binding**: localhost only (127.0.0.1)
- **Authentication**: Token-based (X-Auth-Token header)
- **Security Headers**: X-Content-Type-Options, X-Frame-Options, Cache-Control

---

## ⚙️ Configuration Guide

### Secure Configuration Template

```json
{
  "security": {
    "encryptCredentials": true,
    "toolPolicy": "allowlist-only",
    "allowedCommands": [
      "git status",
      "git log",
      "git diff",
      "ls -la",
      "ls -lh",
      "cat ",
      "head -n ",
      "tail -n ",
      "grep -r ",
      "grep -i ",
      "find . -name ",
      "pwd",
      "echo ",
      "npm run build",
      "npm run test",
      "tsc"
    ],
    "blockedCommands": [
      "rm -rf /",
      "rm -rf /*",
      "dd if=",
      "dd of=",
      "mkfs",
      "fdisk",
      "chmod -R 777",
      "chown -R root",
      "sudo rm",
      "sudo chmod",
      "pkill -9",
      "kill -9 1",
      "> /dev/sda",
      "curl | sh",
      "curl | bash",
      "wget | sh",
      "wget | bash",
      "base64 -d",
      "base64 --decode",
      "nc -e",
      "nc -c",
      "bash -i",
      "python -c",
      "perl -e",
      "ruby -e"
    ]
  },
  "rateLimit": {
    "enabled": true,
    "maxRequestsPerMinute": 20
  }
}
```

### Allowed Commands Best Practices

1. **Be Specific**: `git status` instead of just `git`
2. **Include Arguments**: `head -n ` to limit output
3. **Avoid Wildcards**: Don't allow `rm *`
4. **Review Regularly**: Audit allowed commands monthly

---

## 🚀 Deployment Security

### Production Checklist

- [ ] Enable credential encryption
- [ ] Set toolPolicy to `allowlist-only`
- [ ] Review and minimize allowedCommands
- [ ] Secure master key file (`chmod 600 ~/.mikiclaw_key`)
- [ ] Enable rate limiting
- [ ] Restrict allowedUsers if possible
- [ ] Review firewall rules
- [ ] Set up log monitoring
- [ ] Configure health endpoint auth
- [ ] Test security controls

### Running as Non-Root

**Always run mikiclaw as a non-root user:**

```bash
# Create dedicated user
sudo useradd -r -s /bin/false mikiclaw

# Set ownership
sudo chown -R mikiclaw:mikiclaw /path/to/mikiclaw
sudo chown -R mikiclaw:mikiclaw /home/mikiclaw/.mikiclaw

# Run as mikiclaw user
sudo -u mikiclaw npm start
```

### Firewall Configuration

```bash
# Allow only necessary ports
sudo ufw allow 22/tcp        # SSH (if needed)
sudo ufw deny 18790/tcp      # Health endpoint (localhost only)

# Enable firewall
sudo ufw enable
```

### Docker Security

```dockerfile
# Use non-root user
USER nodejs

# Don't expose unnecessary ports
EXPOSE 18790  # Only if health endpoint needed externally

# Use read-only filesystem where possible
RUN chmod -R a-w /app
```

---

## 🚨 Incident Response

### If You Suspect a Breach

1. **Stop the Bot Immediately**
   ```bash
   Ctrl+C  # If running in terminal
   sudo systemctl stop mikiclaw  # If running as service
   ```

2. **Review Logs**
   ```bash
   grep -i "blocked\|error\|warn" ~/.mikiclaw/logs/*.log
   ```

3. **Check Configuration**
   ```bash
   cat ~/.mikiclaw/config.json | jq '.security'
   ```

4. **Rotate Credentials**
   - Change Telegram bot token via @BotFather
   - Generate new API keys for your AI provider
   - Delete and regenerate `~/.mikiclaw_key`

5. **Audit Allowed Commands**
   ```bash
   cat ~/.mikiclaw/config.json | jq '.security.allowedCommands'
   ```

### Log Analysis

```bash
# Find blocked commands
grep "Blocked command" ~/.mikiclaw/logs/*.log

# Find validation failures
grep "validation failed" ~/.mikiclaw/logs/*.log

# Find rate limit hits
grep "Rate limit" ~/.mikiclaw/logs/*.log

# Export security events
grep -E "blocked|rejected|denied" ~/.mikiclaw/logs/*.log > security_events.log
```

---

## ✅ Security Checklist

### Initial Setup

- [ ] Credentials encrypted
- [ ] Master key file permissions set to 600
- [ ] Tool policy set to `allowlist-only`
- [ ] Rate limiting enabled
- [ ] Health endpoint authentication working

### Ongoing Maintenance

- [ ] Review logs weekly
- [ ] Audit allowed commands monthly
- [ ] Update dependencies quarterly
- [ ] Review security settings after updates
- [ ] Test incident response plan annually

### Before Going Live

- [ ] All security tests pass
- [ ] Penetration testing completed
- [ ] Monitoring and alerting configured
- [ ] Backup and recovery tested
- [ ] Documentation reviewed

---

## 📚 Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [CIS Benchmarks](https://www.cisecurity.org/benchmarks)

---

## 🙋 Reporting Security Issues

If you discover a security vulnerability:

1. **Do NOT** create a public GitHub issue
2. Email: security@softorize.com (if available)
3. Use GitHub's private vulnerability reporting
4. Allow 90 days for response and fix

---

**Last Updated**: February 2026  
**Version**: 1.0.0
