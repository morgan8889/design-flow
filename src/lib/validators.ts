import { z } from "zod";

export const createProjectSchema = z
  .object({
    name: z.string().min(1),
    githubUrl: z.string().url().optional(),
    localPath: z.string().min(1).optional(),
    source: z.enum(["github_discovered", "github_manual", "local"]),
  })
  .refine((data) => data.githubUrl || data.localPath, {
    message: "At least one of githubUrl or localPath is required",
  });

export const updateProjectSchema = z.object({
  isTracked: z.boolean().optional(),
  localPath: z.string().min(1).optional(),
  githubUrl: z.string().url().optional(),
});

export const attentionFilterSchema = z.object({
  type: z
    .enum([
      "pr_needs_review",
      "checks_failing",
      "pr_merge_ready",
      "plan_changed",
      "phase_blocked",
      "new_project",
      "stale_project",
    ])
    .optional(),
  projectId: z.string().optional(),
  resolved: z.boolean().optional(),
});
