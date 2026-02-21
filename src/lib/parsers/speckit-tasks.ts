import type { ParserProfile, ParsedPlan, PlanPhase, PlanTask, PhaseStatus } from "@/lib/types";

function deriveStatus(tasks: PlanTask[]): PhaseStatus {
  if (tasks.length === 0) return "not_started";
  const doneCount = tasks.filter((t) => t.done).length;
  if (doneCount === tasks.length) return "completed";
  if (doneCount > 0) return "in_progress";
  return "not_started";
}

export const speckitTasksProfile: ParserProfile = {
  name: "speckit-tasks",

  detect(content: string): boolean {
    // Matches speckit task ID format: - [ ] T001 or - [x] T001
    return /^- \[[ xX]\] T\d+/m.test(content);
  },

  parse(content: string): ParsedPlan {
    const titleMatch = content.match(/^# (.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : "Untitled Plan";

    const lines = content.split("\n");
    const phases: PlanPhase[] = [];
    let currentPhase: PlanPhase | null = null;

    for (const line of lines) {
      // ## Phase N: Name headings
      const phaseMatch = line.match(/^## (.+)$/);
      if (phaseMatch) {
        if (currentPhase) {
          currentPhase.status = deriveStatus(currentPhase.tasks);
          phases.push(currentPhase);
        }
        currentPhase = { name: phaseMatch[1].trim(), status: "not_started", tasks: [] };
        continue;
      }

      // - [ ] T001 [P] [US1] Description
      const taskMatch = line.match(/^- \[([ xX])\] (T\d+.*)/);
      if (taskMatch) {
        if (!currentPhase) {
          // No phase heading yet — create a default phase
          currentPhase = { name: "Tasks", status: "not_started", tasks: [] };
        }
        currentPhase.tasks.push({
          done: taskMatch[1].toLowerCase() === "x",
          text: taskMatch[2].trim(),
        });
      }
    }

    if (currentPhase) {
      currentPhase.status = deriveStatus(currentPhase.tasks);
      phases.push(currentPhase);
    }

    return { title, format: "speckit-tasks", phases };
  },
};
