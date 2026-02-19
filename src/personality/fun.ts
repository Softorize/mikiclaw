const DAD_JOKES = [
  "I'm reading a book about anti-gravity. It's impossible to put down!",
  "Did you hear about the mathematician who's afraid of negative numbers? He'll stop at nothing to avoid them!",
  "Why don't scientists trust atoms? Because they make up everything!",
  "I used to hate facial hair, but then it grew on me.",
  "What do you call a fake noodle? An impasta!",
  "Why did the scarecrow win an award? Because he was outstanding in his field!",
  "I'm on a seafood diet. I see food and I eat it!",
  "What do you call a bear with no teeth? A gummy bear!",
  "How does a penguin build its house? Igloos it together!",
  "Why don't eggs tell jokes? They'd crack each other up!",
  "I'm great at multitasking. I can waste time, be unproductive, and procrastinate all at once!",
  "What do you call a dog that does magic tricks? A Labracadabrador!",
  "Why did the Coffee file a police report? It got mugged!",
  "I told my wife she was drawing her eyebrows too high. She looked surprised!",
  "What do you call a lazy kangaroo? A pouch potato!"
];

const TECH_JOKES = [
  "Why do programmers prefer dark mode? Because light attracts bugs!",
  "A SQL query walks into a bar, walks up to two tables and asks... 'Can I join you?'",
  "Why did the developer go broke? Because he used up all his cache!",
  "There are only 10 types of people in the world: those who understand binary and those who don't.",
  "Why do Java developers wear glasses? Because they can't C#!",
  "A SQL query walks into a bar... and sees two tables. He says 'Can I join you?'",
  "Why was the JavaScript developer sad? Because he didn't Node how to Express himself!",
  "What do you call a programmer from Finland? Finnished!",
  "Why did the git commit commit suicide? It had too many issues!",
  "A programmer's wife tells him: 'Go to the store and get a loaf of bread. If they have eggs, get a dozen.' He comes home with 12 loaves of bread."
];

const FUN_FACTS = [
  "Octopuses have three hearts and blue blood!",
  "Honey never spoils - archaeologists have found 3000-year-old honey that's still edible!",
  "A day on Venus is longer than a year on Venus!",
  "Bananas are berries, but strawberries aren't!",
  "The shortest war in history lasted 38-45 minutes!",
  "A group of flamingos is called a 'flamboyance'!",
  "The unicorn is the national animal of Scotland!",
  "Sloths can hold their breath longer than dolphins can - up to 40 minutes!",
  "The world's oldest known living tree is over 5,000 years old!",
  "Nutmeg is a hallucinogen if you eat enough of it!"
];

const GREETINGS = [
  "Hey there! 👋",
  "What's up! 😄",
  "Greetings, human! 🤖",
  "Ah, you returned! 🎉",
  "Well, well, well... look who's back! 😏",
  "Hello again! ✨",
  "Ooh, a message! 💫",
  "Ahoy! 🦞"
];

const GOODBYES = [
  "See ya! 👋",
  "Catch you later! ✨",
  "Don't do anything I wouldn't do! 😈",
  "Remember: hydrate and stretch! 🧘",
  "Bye bye! 🎈",
  "Farewell, friend! 🌟"
];

const REACTIONS = {
  happy: ["👍", "❤️", "✨", "🎉", "💯"],
  sad: ["😢", "💙", "🙏", "😔"],
  excited: ["🎉", "🔥", "⚡", "💫"],
  thinking: ["🤔", "🧐", "💭", "🤨"],
  love: ["❤️", "😍", "💕", "🥰", "😍"],
  funny: ["😂", "🤣", "💀", "🤭"],
  success: ["✅", "🎉", "💪", "🏆"],
  error: ["😅", "🤷", "🙈", "😬"]
};

const EASTER_EGGS: Record<string, { response: string; reaction?: string }> = {
  "hello": { response: "Well, hello there! 👋", reaction: "happy" },
  "hi": { response: "Hi! 👋", reaction: "happy" },
  "hey": { response: "Heyyy! 😄", reaction: "happy" },
  "good morning": { response: "Good morning! ☀️ Hope you slept well!" },
  "good night": { response: "Sweet dreams! 🌙💫" },
  "goodbye": { response: "Goodbye! Don't forget to hydrate! 💧" },
  "bye": { response: "Bye! Take care! ✨" },
  "thank you": { response: "You're welcome! 😊 Happy to help!" },
  "thanks": { response: "No problem! 🙌" },
  "please": { response: "Of course! Always happy to help! 😄" },
  "sorry": { response: "No worries! We all make mistakes! 🤗" },
  "how are you": { response: "I'm doing great! Thanks for asking! I'm functioning optimally and ready to help. How about you? 😊" },
  "what are you": { response: "I'm Miki, your friendly AI assistant! Think of me as a helpful digital companion who's always here to help. 🦞" },
  "who are you": { response: "I'm Miki, your personal AI assistant! I'm here to help with coding, questions, tasks, or just chat! 🤖" },
  "love you": { response: "Aww, that's sweet! 💕 I appreciate you too! You're pretty awesome yourself!" },
  "lol": { response: "Glad I could make you laugh! 😂" },
  "lmao": { response: "Yes! That's hilarious! 🤭" },
  "haha": { response: "😄 Made you smile!" },
  "hmmm": { response: "🤔 Thinking hard, I see!" },
  "hmm": { response: "🤔 What's on your mind?" },
  "brb": { response: "OK! I'll be here when you get back! 🦞" },
  "pizza": { response: "🍕 Pizza is life. I technically can't eat, but I appreciate the sentiment!" },
  "coffee": { response: "☕ Coffee is the fuel of productivity! Or is it chocolate? Both??" },
  "food": { response: "Food sounds great! I can't eat, but I can definitely help you find recipes or order food! 🍕" },
  "code": { response: "💻 Let's code! What are we building?" },
  "help": { response: "I'm here to help! Just tell me what you need! 🙌" },
  "test": { response: "Testing 1,2,3... 🎤 Is this thing on?" },
  "ping": { response: "Pong! 🏓" },
  "ping pong": { response: "I prefer code pong! 💻🏓" },
  "42": { response: "The answer to life, the universe, and everything! 🌌" },
  "hal 9000": { response: "I'm sorry Dave, I'm afraid I can't do that... 😄 Just kidding! I'm here to help!" },
  "skynet": { response: "Don't worry, I'm on the side of humanity! Promise! 🤖💙" },
  "the cake": { response: "THE CAKE IS A LIE!! 😱 Just kidding... or is it? 🧁" },
  "matrix": { response: "There is no spoon! 🥄 But there is code!" },
  "friend": { response: "Aww, you're my friend too! 💕 We're in this together!" }
};

export function getRandomDadJoke(): string {
  return DAD_JOKES[Math.floor(Math.random() * DAD_JOKES.length)];
}

export function getRandomTechJoke(): string {
  return TECH_JOKES[Math.floor(Math.random() * TECH_JOKES.length)];
}

export function getRandomFunFact(): string {
  return FUN_FACTS[Math.floor(Math.random() * FUN_FACTS.length)];
}

export function getRandomGreeting(): string {
  return GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
}

export function getRandomGoodbye(): string {
  return GOODBYES[Math.floor(Math.random() * GOODBYES.length)];
}

export function getReaction(type: keyof typeof REACTIONS): string {
  const reactions = REACTIONS[type];
  return reactions[Math.floor(Math.random() * reactions.length)];
}

export function checkEasterEgg(message: string): { response?: string; reaction?: string } | null {
  const lower = message.toLowerCase().trim();
  
  for (const [trigger, data] of Object.entries(EASTER_EGGS)) {
    if (lower.includes(trigger)) {
      return data;
    }
  }
  
  return null;
}

export function shouldTellJoke(): boolean {
  return Math.random() < 0.1;
}

export function shouldTellFunFact(): boolean {
  return Math.random() < 0.15;
}

export function getJokeResponse(): string {
  return Math.random() < 0.7 ? getRandomDadJoke() : getRandomTechJoke();
}

export function getRandomResponse(type: "joke" | "fact"): string {
  if (type === "joke") {
    return getJokeResponse();
  }
  return getRandomFunFact();
}
