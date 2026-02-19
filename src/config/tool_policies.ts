import { configManager } from "./manager.js";

export type ToolGroup = 
  | "runtime"
  | "filesystem"
  | "web"
  | "messaging"
  | "system"
  | "development"
  | "custom";

export interface ToolPolicyConfig {
  profile: "minimal" | "coding" | "messaging" | "full" | "custom";
  groups: Record<ToolGroup, boolean>;
  allowlist: string[];
  blocklist: string[];
}

const TOOL_GROUPS: Record<string, string[]> = {
  runtime: ["bash", "exec", "process", "nodejs"],
  filesystem: ["read_file", "write_file", "list_directory", "glob", "grep", "edit_file"],
  web: ["search", "web_search", "web_fetch", "curl"],
  messaging: ["message", "send_message"],
  system: ["get_system_info", "get_env", "get_config"],
  development: ["git", "npm", "node", "python", "docker"],
  custom: []
};

const PROFILES: Record<string, Record<ToolGroup, boolean>> = {
  minimal: {
    runtime: false,
    filesystem: false,
    web: false,
    messaging: false,
    system: true,
    development: false,
    custom: false
  },
  coding: {
    runtime: true,
    filesystem: true,
    web: true,
    messaging: false,
    system: true,
    development: true,
    custom: true
  },
  messaging: {
    runtime: false,
    filesystem: false,
    web: true,
    messaging: true,
    system: true,
    development: false,
    custom: true
  },
  full: {
    runtime: true,
    filesystem: true,
    web: true,
    messaging: true,
    system: true,
    development: true,
    custom: true
  }
};

export function getToolPolicyConfig(): ToolPolicyConfig {
  const config = configManager.load();
  const security = config.security as any || {};
  
  const profile = (security.toolProfile as string) || "coding";
  const groups = PROFILES[profile] || PROFILES.coding;
  
  return {
    profile: profile as ToolPolicyConfig["profile"],
    groups,
    allowlist: security.allowedCommands || [],
    blocklist: security.blockedCommands || []
  };
}

export function isToolAllowed(toolName: string): { allowed: boolean; reason?: string } {
  const policy = getToolPolicyConfig();

  if (policy.blocklist.some(blocked => toolName.includes(blocked))) {
    return { allowed: false, reason: `Tool '${toolName}' is blocked` };
  }

  if (policy.allowlist.length > 0) {
    const isAllowed = policy.allowlist.some(allowed => 
      toolName === allowed || toolName.startsWith(allowed + "_")
    );
    if (!isAllowed) {
      return { allowed: false, reason: `Tool '${toolName}' not in allowlist` };
    }
  }

  for (const [groupName, tools] of Object.entries(TOOL_GROUPS)) {
    if (tools.includes(toolName)) {
      const groupKey = groupName as ToolGroup;
      if (policy.groups[groupKey] === false) {
        return { allowed: false, reason: `Tool group '${groupName}' is disabled` };
      }
    }
  }

  return { allowed: true };
}

export function getToolsByGroup(group: ToolGroup): string[] {
  return TOOL_GROUPS[group] || [];
}

export function getAllGroups(): ToolGroup[] {
  return Object.keys(TOOL_GROUPS) as ToolGroup[];
}
