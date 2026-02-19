interface LoopEntry {
  toolName: string;
  input: string;
  timestamp: number;
  resultLength: number;
}

interface LoopDetectionResult {
  isLooping: boolean;
  warning: string | null;
  shouldStop: boolean;
  reason: string | null;
}

class LoopDetector {
  private history: Map<number, LoopEntry[]> = new Map();
  private maxHistory: number = 50;
  private warningThreshold: number = 10;
  private criticalThreshold: number = 20;

  recordCall(chatId: number, toolName: string, input: Record<string, unknown>, resultLength: number): void {
    const history = this.history.get(chatId) || [];
    
    history.push({
      toolName,
      input: JSON.stringify(input),
      timestamp: Date.now(),
      resultLength
    });

    if (history.length > this.maxHistory) {
      history.shift();
    }

    this.history.set(chatId, history);
  }

  detect(chatId: number): LoopDetectionResult {
    const history = this.history.get(chatId) || [];
    
    if (history.length < this.warningThreshold) {
      return { isLooping: false, warning: null, shouldStop: false, reason: null };
    }

    const recentCalls = history.slice(-this.criticalThreshold);
    
    const sameToolCalls = recentCalls.filter((call, i) => {
      if (i === 0) return true;
      return call.toolName === recentCalls[0].toolName;
    });

    if (sameToolCalls.length >= this.criticalThreshold) {
      const toolName = recentCalls[0].toolName;
      const sameInputs = sameToolCalls.filter((call, i) => {
        if (i === 0) return true;
        return call.input === sameToolCalls[0].input;
      });

      if (sameInputs.length >= this.criticalThreshold) {
        return {
          isLooping: true,
          warning: null,
          shouldStop: true,
          reason: `Detected exact same tool call (${toolName}) repeated ${sameInputs.length} times`
        };
      }

      return {
        isLooping: true,
        warning: `Warning: ${toolName} called ${sameToolCalls.length} times in a row`,
        shouldStop: false,
        reason: null
      };
    }

    const pollNoProgress = this.detectPollNoProgress(recentCalls);
    if (pollNoProgress) {
      return pollNoProgress;
    }

    const pingPong = this.detectPingPong(recentCalls);
    if (pingPong) {
      return pingPong;
    }

    return { isLooping: false, warning: null, shouldStop: false, reason: null };
  }

  private detectPollNoProgress(recentCalls: LoopEntry[]): LoopDetectionResult | null {
    if (recentCalls.length < 8) return null;

    const pollTools = ["search", "web_search", "glob", "grep", "read_file"];
    let pollCount = 0;
    let noProgressCount = 0;

    for (const call of recentCalls) {
      if (pollTools.includes(call.toolName)) {
        pollCount++;
        if (call.resultLength < 100) {
          noProgressCount++;
        }
      }
    }

    if (pollCount >= 6 && noProgressCount >= 4) {
      return {
        isLooping: true,
        warning: "Warning: Multiple web searches returning no results",
        shouldStop: true,
        reason: "Poll-no-progress pattern detected"
      };
    }

    return null;
  }

  private detectPingPong(recentCalls: LoopEntry[]): LoopDetectionResult | null {
    if (recentCalls.length < 6) return null;

    const lastFew = recentCalls.slice(-6);
    const toolSequence = lastFew.map(c => c.toolName).join(",");

    const patterns = [
      "read_file,write_file,read_file,write_file",
      "bash,bash,bash,bash",
      "search,read_file,search,read_file"
    ];

    for (const pattern of patterns) {
      const patternTools = pattern.split(",");
      if (this.matchesPattern(lastFew.map(c => c.toolName), patternTools, 4)) {
        return {
          isLooping: true,
          warning: "Warning: Detected alternating pattern",
          shouldStop: true,
          reason: "Ping-pong pattern detected"
        };
      }
    }

    return null;
  }

  private matchesPattern(actual: string[], pattern: string[], minMatches: number): boolean {
    if (actual.length < pattern.length) return false;
    
    let matches = 0;
    for (let i = 0; i <= actual.length - pattern.length; i++) {
      let match = true;
      for (let j = 0; j < pattern.length; j++) {
        if (actual[i + j] !== pattern[j]) {
          match = false;
          break;
        }
      }
      if (match) matches++;
    }

    return matches >= minMatches / pattern.length;
  }

  clearHistory(chatId: number): void {
    this.history.delete(chatId);
  }

  setThresholds(warning: number, critical: number): void {
    this.warningThreshold = warning;
    this.criticalThreshold = critical;
  }
}

export const loopDetector = new LoopDetector();
