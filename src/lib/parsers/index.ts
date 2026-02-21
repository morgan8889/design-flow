import type { ParserProfile, ParsedPlan } from "@/lib/types";
import { genericMarkdownProfile } from "./generic-markdown";
import { taskListProfile } from "./task-list";
import { speckitTasksProfile } from "./speckit-tasks";

const profiles: ParserProfile[] = [speckitTasksProfile, taskListProfile, genericMarkdownProfile];

export function registerProfile(profile: ParserProfile): void {
  // Insert before generic-markdown (which should always be last as fallback)
  const genericIdx = profiles.findIndex((p) => p.name === "generic-markdown");
  if (genericIdx >= 0) {
    profiles.splice(genericIdx, 0, profile);
  } else {
    profiles.push(profile);
  }
}

export function getProfileNames(): string[] {
  return profiles.map((p) => p.name);
}

function detectFromFrontmatter(content: string): string | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const frontmatter = match[1];
  const frameworkMatch = frontmatter.match(/^(?:framework|generator):\s*(.+)$/m);
  return frameworkMatch ? frameworkMatch[1].trim() : null;
}

export function detectAndParse(content: string): ParsedPlan | null {
  // 1. Check frontmatter for explicit framework declaration
  const declared = detectFromFrontmatter(content);
  if (declared) {
    const profile = profiles.find((p) => p.name === declared);
    if (profile) {
      return profile.parse(content);
    }
  }

  // 2. Try each profile's detect method
  for (const profile of profiles) {
    if (profile.detect(content)) {
      return profile.parse(content);
    }
  }

  // 3. No match
  return null;
}
