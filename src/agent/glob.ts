import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export async function glob(pattern: string): Promise<string> {
  const { execa } = await import("execa");
  
  try {
    const { stdout } = await execa("find", [".", "-type", "f", "-name", pattern.replace("*", "*")]);
    const files = stdout.split("\n").filter(Boolean).slice(0, 20);
    return files.length > 0 ? files.join("\n") : "No files found";
  } catch {
    return "Error running glob";
  }
}
