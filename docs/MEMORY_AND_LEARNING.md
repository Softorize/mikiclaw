# 🧠 Memory & Personality Learning System

mikiclaw now features an advanced memory and personality learning system that adapts to your communication style and preferences over time.

---

## ✨ Features

### 1. **Communication Style Learning**

The bot learns how you communicate and adapts its responses to match your style:

| Aspect | What It Learns | How It Adapts |
|--------|----------------|---------------|
| **Formality** | Detects formal vs casual language | Adjusts tone to match |
| **Verbosity** | Notices if you prefer short or long messages | Responds with similar length |
| **Technical Level** | Recognizes technical vocabulary | Uses appropriate terminology |
| **Emoji Usage** | Tracks emoji frequency | Matches emoji usage |
| **Response Length** | Detects preference for brief/detailed | Adjusts response length |
| **Greeting Style** | Learns casual vs professional greetings | Greets you appropriately |

### 2. **User Preference Learning**

Automatically discovers and remembers:

- **Topics of Interest**: Coding, design, business, learning, creative work
- **Working Style**: Collaborative vs independent, needs guidance vs self-directed
- **Learning Style**: Visual, verbal, hands-on, theoretical
- **Time Preferences**: Concise vs detailed, step-by-step vs overview

### 3. **Personality Evolution**

The bot's personality evolves based on your interactions:

- **Warmth**: Increases with positive interactions
- **Empathy**: Increases when you seem frustrated
- **Enthusiasm**: Adapts to your energy level
- **Humor**: Adjusts based on your responses

### 4. **Memory Consolidation**

- **Automatic Cleanup**: Old memories decay in importance over time
- **Pattern Recognition**: Identifies recurring topics and preferences
- **Smart Compression**: Keeps important memories, removes trivial ones
- **Context Retrieval**: Brings up relevant memories during conversations

---

## 🔧 How It Works

### Message Analysis

Every message you send is analyzed for:

```typescript
{
  formality: number,        // 1-10 scale
  verbosity: number,        // 1-10 scale
  technicalLevel: number,   // 1-10 scale
  emojiUsage: number,       // 1-10 scale
  responseLength: "short" | "medium" | "long",
  greetingStyle: "casual" | "professional" | "friendly",
  commonTopics: string[],
  interactionCount: number
}
```

### Profile Storage

User profiles are stored in:
```
~/.mikiclaw/workspace/profiles/<user-id>.json
```

### Memory Storage

Long-term memories are stored in:
```
~/.mikiclaw/workspace/MEMORY.md
```

---

## 📊 What Gets Learned

### From Your Messages

| You Say | Bot Learns |
|---------|------------|
| "Hey! Quick question..." | Casual style, prefers brevity |
| "Could you please explain..." | Formal, wants detailed explanation |
| "Just give me the code" | Technical, wants concise answers |
| "Explain like I'm 5" | Prefers simple explanations |
| "Thanks! Perfect!" | Positive feedback → reinforce style |
| "That's confusing" | Needs more empathy, different approach |

### From Interactions

| Interaction | Bot Adapts |
|-------------|------------|
| You ask many questions | Becomes more explanatory |
| You use technical terms | Increases technical level |
| You use emojis | Uses more emojis |
| You seem frustrated | Increases empathy, offers help |
| You thank the bot | Reinforces successful approach |

---

## 🎯 Personality Adaptation Examples

### Example 1: Technical User

**User Profile After 10 Interactions:**
```json
{
  "formality": 4,
  "technicalLevel": 9,
  "verbosity": 3,
  "emojiUsage": 1,
  "responseLength": "short",
  "commonTopics": ["coding", "technology"]
}
```

**Bot's Response Style:**
- Uses technical terminology
- Concise, code-focused responses
- Minimal emojis
- Assumes technical knowledge

### Example 2: Learning-Focused User

**User Profile:**
```json
{
  "formality": 6,
  "technicalLevel": 4,
  "verbosity": 8,
  "prefersExamples": true,
  "needsGuidance": true,
  "learningStyle": { "stepByStep": true }
}
```

**Bot's Response Style:**
- Detailed explanations
- Provides examples
- Step-by-step guidance
- Encouraging tone

---

## 🔄 Memory Lifecycle

### 1. **Creation**
- Every interaction creates a memory entry
- Initial importance: 3-5 (medium)
- Tagged with topics and user ID

### 2. **Reinforcement**
- Repeated topics increase in importance
- Positive feedback boosts related memories
- Frequently accessed memories stay relevant

### 3. **Decay**
- After 30 days: -1 importance
- After 60 days: -2 importance
- Low importance memories removed if space needed

### 4. **Consolidation**
- Runs periodically
- Compresses old conversations
- Removes duplicates
- Keeps top 500 most important memories

---

## 📁 File Structure

```
~/.mikiclaw/workspace/
├── MEMORY.md              # Long-term memory store
├── profiles/
│   └── <user-id>.json     # User communication profile
├── conversations/
│   └── <chat-id>.json     # Conversation history
└── SOUL.md                # Base personality definition
```

---

## 🛠 Advanced Features

### Context Injection

The bot automatically injects relevant context into conversations:

```
# User Communication Style
- Use casual, friendly language
- Keep responses concise and brief
- Assume user has technical knowledge
- Prefer short responses

# User Interests
User interests: coding, technology, design

# Relevant Memories
- User prefers code examples over explanations
- User works with TypeScript and React
- User asked about browser automation yesterday
```

### Preference Detection

Automatically detects preferences from message patterns:

| Keyword/Pattern | Detected Preference |
|-----------------|---------------------|
| "brief", "quick", "short" | Prefers concise responses |
| "detailed", "explain", "elaborate" | Wants comprehensive answers |
| "please" + "thank" | Professional greeting style |
| "hey", "yo" | Casual greeting style |
| "eli5", "simple" | Low technical level |
| "technical", "advanced" | High technical level |

---

## 🎮 Usage Examples

### Test the Learning System

1. **Start with formal language:**
   ```
   User: Could you please help me understand how to use the browser tools?
   Bot: [Responds formally and detailed]
   ```

2. **Switch to casual:**
   ```
   User: hey can u show me the code?
   Bot: [Adapts to casual, shows code]
   ```

3. **Express preference:**
   ```
   User: I prefer short answers
   Bot: [Remembers and uses short responses]
   ```

4. **Show frustration:**
   ```
   User: This is confusing
   Bot: [Increases empathy, offers clearer explanation]
   ```

5. **Show satisfaction:**
   ```
   User: Perfect! Thanks!
   Bot: [Reinforces successful approach]
   ```

---

## 🔍 Viewing User Profile

User profiles are stored as JSON:

```json
{
  "style": {
    "formality": 5,
    "verbosity": 5,
    "technicalLevel": 7,
    "emojiUsage": 2,
    "responseLength": "medium",
    "greetingStyle": "friendly",
    "asksQuestions": true,
    "prefersBullets": false,
    "avgMessageLength": 150,
    "commonTopics": ["coding", "technology"],
    "interactionCount": 25,
    "lastUpdated": "2026-02-19T03:37:00.000Z"
  },
  "preferences": {
    "interests": [
      {"topic": "coding", "level": 8, "lastDiscussed": "2026-02-19"},
      {"topic": "technology", "level": 6, "lastDiscussed": "2026-02-18"}
    ],
    "workingStyle": {
      "collaborative": true,
      "prefersExamples": true
    },
    "learningStyle": {
      "verbal": true,
      "handsOn": true
    }
  },
  "personality": {
    "warmth": 7,
    "enthusiasm": 6,
    "humor": 4,
    "empathy": 7,
    "adaptations": [...]
  }
}
```

---

## 🚀 Benefits

1. **Personalized Experience**: Bot adapts to YOUR style
2. **Better Communication**: Matches your preferences automatically
3. **Learning Over Time**: Gets better with each interaction
4. **Context Awareness**: Remembers important facts about you
5. **Natural Interaction**: Feels like talking to someone who knows you

---

## 📝 Notes

- **Privacy**: All data stored locally on your machine
- **Control**: You can clear memory anytime with `/new` command
- **Transparency**: Profile stored in readable JSON format
- **Efficiency**: Automatic cleanup prevents bloat

---

**Last Updated**: February 2026  
**Version**: 2.0.0 (with Memory & Personality Learning)
