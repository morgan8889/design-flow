export type ProjectSource = "github_discovered" | "github_manual" | "local";

export type AttentionType =
  | "pr_needs_review"
  | "checks_failing"
  | "pr_merge_ready"
  | "plan_changed"
  | "phase_blocked"
  | "new_project"
  | "stale_project";

export type PhaseStatus = "not_started" | "in_progress" | "completed";

export interface PlanTask {
  text: string;
  done: boolean;
}

export interface PlanPhase {
  name: string;
  status: PhaseStatus;
  tasks: PlanTask[];
}

export interface ParsedPlan {
  title: string;
  format: string;
  phases: PlanPhase[];
}

export interface ParserProfile {
  name: string;
  detect: (content: string) => boolean;
  parse: (content: string) => ParsedPlan;
}
