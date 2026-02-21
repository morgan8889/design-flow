import type { ParserProfile, ParsedPlan, PlanPhase, PlanTask, PhaseStatus } from "@/lib/types";

function deriveStatus(tasks: PlanTask[]): PhaseStatus {
  if (tasks.length === 0) return "not_started";
  const doneCount = tasks.filter((t) => t.done).length;
  if (doneCount === tasks.length) return "completed";
  if (doneCount > 0) return "in_progress";
  return "not_started";
}

export const genericMarkdownProfile: ParserProfile = {
  name: "generic-markdown",

  detect(content: string): boolean {
    const hasH2 = /^## .+/m.test(content);
    const hasChecklist = /^- \[(x| )\] .+/m.test(content);
    return hasH2 && hasChecklist;
  },

  parse(content: string): ParsedPlan {
    const lines = content.split("\n");

    // Extract title from first H1
    const titleMatch = content.match(/^# (.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : "Untitled Plan";

    const phases: PlanPhase[] = [];
    let currentPhase: PlanPhase | null = null;

    for (const line of lines) {
      const h2Match = line.match(/^## (.+)$/);
      if (h2Match) {
        if (currentPhase) {
          currentPhase.status = deriveStatus(currentPhase.tasks);
          phases.push(currentPhase);
        }
        currentPhase = {
          name: h2Match[1].trim(),
          status: "not_started",
          tasks: [],
        };
        continue;
      }

      const taskMatch = line.match(/^- \[(x| )\] (.+)$/);
      if (taskMatch && currentPhase) {
        currentPhase.tasks.push({
          done: taskMatch[1] === "x",
          text: taskMatch[2].trim(),
        });
      }
    }

    // Push last phase
    if (currentPhase) {
      currentPhase.status = deriveStatus(currentPhase.tasks);
      phases.push(currentPhase);
    }

    return { title, format: "generic-markdown", phases };
  },
};
