# 🚀 Deployment Guide

Complete guide for deploying mikiclaw to various environments.

---

## 📋 Table of Contents

- [Local Development](#local-development)
- [Docker Deployment](#docker-deployment)
- [Linux Systemd Service](#linux-systemd-service)
- [PM2 Process Manager](#pm2-process-manager)
- [Cloud Platforms](#cloud-platforms)
- [Production Checklist](#production-checklist)

---

## 💻 Local Development

### Quick Setup

```bash
# Clone repository
git clone https://github.com/Softorize/mikiclaw
cd mikiclaw

# Install dependencies
npm install

# Build
npm run build

# Run setup wizard
npm run setup

# Start bot
npm start
```

### Development Mode

```bash
# Hot reload on changes
npm run dev
```

### Verify Installation

```bash
# Check status
npm run status

# Check health endpoint
curl http://localhost:18790/health

# Get auth token (localhost only)
curl http://localhost:18790/token
```

---

## 🐳 Docker Deployment

### Dockerfile

```dockerfile
# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:22-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy built files from builder
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Create data directory
RUN mkdir -p /home/nodejs/.mikiclaw && \
    chown -R nodejs:nodejs /home/nodejs/.mikiclaw

USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:18790/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Expose health endpoint (optional)
EXPOSE 18790

# Use dumb-init as PID 1
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js", "start"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  mikiclaw:
    build: .
    container_name: mikiclaw
    restart: unless-stopped
    volumes:
      # Persist configuration and data
      - mikiclaw-data:/home/nodejs/.mikiclaw
      # Optional: mount config from host
      - ./config.json:/home/nodejs/.mikiclaw/config.json:ro
    environment:
      - NODE_ENV=production
      # Optional: override config with env vars
      # - TELEGRAM_BOT_TOKEN=your_token
      # - ANTHROPIC_API_KEY=your_key
    ports:
      # Only expose if needed (localhost default)
      - "127.0.0.1:18790:18790"
    networks:
      - mikiclaw-network
    # Resource limits
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 128M

volumes:
  mikiclaw-data:
    driver: local

networks:
  mikiclaw-network:
    driver: bridge
```

### Build and Run

```bash
# Build image
docker-compose build

# Start service
docker-compose up -d

# View logs
docker-compose logs -f mikiclaw

# Run setup inside container
docker-compose exec mikiclaw npm run setup

# Check status
docker-compose exec mikiclaw npm run status

# Stop service
docker-compose down

# Stop and remove volumes (WARNING: deletes data)
docker-compose down -v
```

### Docker Security Best Practices

```bash
# Run as non-root (already configured)
# Don't expose ports unnecessarily
# Use read-only config files
# Scan for vulnerabilities
docker scan mikiclaw

# Use specific image tags, not 'latest'
# Enable Docker Content Trust
export DOCKER_CONTENT_TRUST=1
```

---

## 🐧 Linux Systemd Service

### Create Service User

```bash
# Create system user
sudo useradd -r -s /bin/false -d /opt/mikiclaw mikiclaw

# Create directories
sudo mkdir -p /opt/mikiclaw
sudo mkdir -p /var/log/mikiclaw
sudo chown -R mikiclaw:mikiclaw /opt/mikiclaw
sudo chown -R mikiclaw:mikiclaw /var/log/mikiclaw
```

### Install Application

```bash
# Copy files
sudo cp -r mikiclaw/* /opt/mikiclaw/
cd /opt/mikiclaw

# Install dependencies
sudo -u mikiclaw npm ci --only=production

# Build
sudo -u mikiclaw npm run build
```

### Create Systemd Service

```ini
# /etc/systemd/system/mikiclaw.service
[Unit]
Description=MikiClaw Telegram Bot
Documentation=https://github.com/Softorize/mikiclaw
After=network.target nss-lookup.target

[Service]
Type=simple
User=mikiclaw
Group=mikiclaw
WorkingDirectory=/opt/mikiclaw
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
StandardOutput=append:/var/log/mikiclaw/out.log
StandardError=append:/var/log/mikiclaw/err.log

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/log/mikiclaw /home/mikiclaw/.mikiclaw
CapabilityBoundingSet=
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictNamespaces=true
RestrictRealtime=true
RestrictSUIDSGID=true
MemoryDenyWriteExecute=true
LockPersonality=true
SystemCallArchitectures=native

# Resource limits
MemoryMax=512M
CPUQuota=100%

# Environment
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### Enable and Start

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable on boot
sudo systemctl enable mikiclaw

# Start service
sudo systemctl start mikiclaw

# Check status
sudo systemctl status mikiclaw

# View logs
sudo journalctl -u mikiclaw -f

# Restart service
sudo systemctl restart mikiclaw
```

### Log Rotation

```ini
# /etc/logrotate.d/mikiclaw
/var/log/mikiclaw/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 mikiclaw mikiclaw
    sharedscripts
    postrotate
        systemctl reload mikiclaw 2>/dev/null || true
    endscript
}
```

---

## ⚡ PM2 Process Manager

### Install PM2

```bash
# Install globally
npm install -g pm2

# Setup PM2 startup
pm2 startup
# Run the command it outputs
```

### Start Application

```bash
# Start with PM2
pm2 start npm --name "mikiclaw" -- start

# Or start built JavaScript directly
pm2 start dist/index.js --name "mikiclaw" -- start

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

### PM2 Configuration File

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'mikiclaw',
    script: 'dist/index.js',
    args: 'start',
    instances: 1,
    exec_mode: 'fork',
    
    // Environment
    env: {
      NODE_ENV: 'production',
    },
    
    // Logging
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    
    // Restart policy
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    
    // Health check
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
```

```bash
# Start with config
pm2 start ecosystem.config.js

# Monitor
pm2 monit

# View logs
pm2 logs mikiclaw

# Restart
pm2 restart mikiclaw

# Stop
pm2 stop mikiclaw

# Delete
pm2 delete mikiclaw
```

---

## ☁️ Cloud Platforms

### Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Link to existing project (optional)
railway link

# Deploy
railway up

# View logs
railway logs
```

**railway.toml**:
```toml
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "npm start"
healthcheckPath = "/health"
healthcheckTimeout = 100
restartPolicyType = "ON_FAILURE"
```

### Render

1. Create new **Web Service**
2. Connect GitHub repository
3. Configure:
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start`
   - **Environment**: Node.js 22
4. Add environment variables:
   - `TELEGRAM_BOT_TOKEN`
   - `ANTHROPIC_API_KEY`
   - `NODE_ENV=production`

### Google Cloud Run

```bash
# Build container
gcloud builds submit --tag gcr.io/PROJECT-ID/mikiclaw

# Deploy
gcloud run deploy mikiclaw \
  --image gcr.io/PROJECT-ID/mikiclaw \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars TELEGRAM_BOT_TOKEN=xxx,ANTHROPIC_API_KEY=xxx \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --concurrency 1
```

### AWS ECS (Fargate)

```bash
# Build and push to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin ACCOUNT.dkr.ecr.us-east-1.amazonaws.com

docker build -t mikiclaw .
docker tag mikiclaw:latest ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/mikiclaw:latest
docker push ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/mikiclaw:latest

# Deploy with ECS CLI
ecs-cli up --cluster mikiclaw-cluster
ecs-cli compose up
```

---

## ✅ Production Checklist

### Pre-Deployment

- [ ] All dependencies updated
- [ ] Security audit completed
- [ ] Tests passing
- [ ] Documentation reviewed
- [ ] Backup strategy in place

### Security

- [ ] Running as non-root user
- [ ] Firewall configured
- [ ] Credentials encrypted
- [ ] Tool policy set to allowlist-only
- [ ] Rate limiting enabled
- [ ] Health endpoint secured
- [ ] Log monitoring configured

### Configuration

- [ ] Environment variables set
- [ ] Config file reviewed
- [ ] Allowed commands minimized
- [ ] Workspace path configured
- [ ] Heartbeat settings adjusted

### Monitoring

- [ ] Health checks configured
- [ ] Log aggregation enabled
- [ ] Alert thresholds set
- [ ] Metrics collection active

### High Availability

- [ ] Restart policy configured
- [ ] Resource limits set
- [ ] Backup schedule created
- [ ] Recovery procedure documented

### Post-Deployment

- [ ] Bot responds to messages
- [ ] All tools working
- [ ] Health endpoint accessible
- [ ] Logs being written
- [ ] Rate limiting functional
- [ ] Memory usage stable

---

## 🔧 Maintenance

### Updating

```bash
# Pull latest changes
git pull origin main

# Install new dependencies
npm install

# Rebuild
npm run build

# Restart service
sudo systemctl restart mikiclaw  # or pm2 restart mikiclaw
```

### Backup

```bash
# Backup configuration
tar -czf mikiclaw-backup-$(date +%Y%m%d).tar.gz \
  ~/.mikiclaw/config.json \
  ~/.mikiclaw/workspace/SOUL.md \
  ~/.mikiclaw/workspace/MEMORY.md \
  ~/.mikiclaw_key

# Store securely (encrypted, off-site)
```

### Restore

```bash
# Stop service
sudo systemctl stop mikiclaw

# Restore files
tar -xzf mikiclaw-backup-YYYYMMDD.tar.gz -C ~/

# Start service
sudo systemctl start mikiclaw
```

---

## 📊 Monitoring

### Health Check Script

```bash
#!/bin/bash
# check-health.sh

TOKEN=$(curl -s http://localhost:18790/token | jq -r '.token')
STATUS=$(curl -s -H "X-Auth-Token: $TOKEN" http://localhost:18790/health)

echo "$STATUS" | jq -r '.status'
```

### Prometheus Metrics Export

```bash
# Install node-exporter for system metrics
# mikiclaw exposes basic metrics at /metrics
curl http://localhost:18790/metrics
```

### Log Analysis

```bash
# Count errors today
grep -c "ERROR" ~/.mikiclaw/logs/mikiclaw-$(date +%Y-%m-%d).log

# Find blocked commands
grep "Blocked command" ~/.mikiclaw/logs/*.log | tail -20

# Check rate limits
grep "Rate limit" ~/.mikiclaw/logs/*.log | tail -10
```

---

**Need help?** See [Troubleshooting.md](docs/TROUBLESHOOTING.md) or open an issue.
