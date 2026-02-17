# Heartbeat Configuration

# Heartbeat Schedule
- interval: 30m (minimum)

# Tasks
## daily_summary
- schedule: "0 9 * * *"
- action: summarize_conversations
- description: Send a daily summary of conversations

## skill_suggestions
- schedule: "0 10 * * 1"
- action: suggest_skills
- description: Suggest relevant skills based on usage

## status_report  
- schedule: "0 8 * * *"
- action: send_status
- description: Send daily system status
