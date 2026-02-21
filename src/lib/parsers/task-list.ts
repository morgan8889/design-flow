import type { ParserProfile, ParsedPlan, PlanPhase, PhaseStatus } from "@/lib/types";

function deriveStatus(stepLines: string[]): PhaseStatus {
  // If there are no step lines we can't determine progress
  if (stepLines.length === 0) return "not_started";
  // Use checklist items if present (- [x] / - [ ])
  const checklistItems = stepLines.filter((l) => /^- \[(x| )\]/.test(l));
  if (checklistItems.length > 0) {
    const done = checklistItems.filter((l) => /^- \[x\]/.test(l)).length;
    if (done === checklistItems.length) return "completed";
    if (done > 0) return "in_progress";
    return "not_started";
  }
  // No checklists — treat as not_started (can't infer from prose steps)
  return "not_started";
}

export const taskListProfile: ParserProfile = {
  name: "task-list",

  detect(content: string): boolean {
    // Matches implementation plans structured as ### Task N: ...
    return /^### Task \d+:/m.test(content);
  },

  parse(content: string): ParsedPlan {
    const titleMatch = content.match(/^# (.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : "Untitled Plan";

    const phases: PlanPhase[] = [];
    const lines = content.split("\n");
    let currentPhase: PlanPhase | null = null;
    let currentStepLines: string[] = [];

    for (const line of lines) {
      const taskMatch = line.match(/^### (Task \d+:.+)$/);
      if (taskMatch) {
        if (currentPhase) {
          currentPhase.status = deriveStatus(currentStepLines);
          phases.push(currentPhase);
        }
        currentPhase = { name: taskMatch[1].trim(), status: "not_started", tasks: [] };
        currentStepLines = [];
        continue;
      }
      if (currentPhase) {
        currentStepLines.push(line);
      }
    }

    if (currentPhase) {
      currentPhase.status = deriveStatus(currentStepLines);
      phases.push(currentPhase);
    }

    return { title, format: "task-list", phases };
  },
};
