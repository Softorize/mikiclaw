#!/bin/bash

# mikiclaw configuration backup script
# Backs up config, workspace, and encryption key

set -e

# Default values
BACKUP_DIR="$HOME/mikiclaw-backups"
CONFIG_DIR="$HOME/.mikiclaw"
KEY_FILE="$HOME/.mikiclaw_key"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="mikiclaw-backup-$TIMESTAMP.tar.gz"

# Parse arguments
while [[ $# -gt 0 ]]