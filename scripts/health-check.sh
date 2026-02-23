#!/bin/bash

# mikiclaw health check script
# Usage: ./scripts/health-check.sh [options]

set -e

HEALTH_URL="http://localhost:19090/health"
TOKEN_URL="http://localhost:19090/token"
METRICS_URL="http://localhost:19090/metrics"

# Default values
VERBOSE=false
AUTH_TOKEN=""

# Parse arguments
while [[ $# -gt 0 ]]